/* author: ijkilchenko@gmail.com
MIT license */

var sanitizedVisibleText; // holds all the visible text on current tab as a string (after sanitization)
var sanitizedUniqueVisibleWords; // array of the vocabulary of sanitized words on current tab
var localWords2Vects = {}; // subset of the whole word2vec dictionary of words that appear on current tab

var highlited; // span elements which are currently highlighted
var lastSearchText = ''; // used to populate the popup after being closed

var previousMatchesSelectedCount = 0;

function sanitize(str) {
	// remove any "bad" character and lower case everything remaining and trim
	return str.replace(/[^a-zA-Z ]/g, "").toLowerCase().trim();
}

var portB2 = chrome.runtime.connect({name: "vectorsLookup"});
/* anytime we get a message back from background page under this port, we enrich our local word2vec dictionary
we can continuously look up the vectors for the search terms and add those definitions to localWords2Vects */
portB2.onMessage.addListener(function(msg) {
	for (var word in msg.localWords2Vects){
		localWords2Vects[word] = msg.localWords2Vects[word];
	}
});

function parseDom() {
	/* This function is run independently of whether or not the fuzbal popup is opened on a tab (every tab is thus parsed 
	right away in order to preprocess the text on the tab). We want to get the whole visible text of the tab, 
	sanitizedVisibleText, joined across every visible element on the page. We also want to find the vocabulary of the tab, 
	the unique words on the page, sanitizedUniqueVisibleWords, and use those to order a local word2vec dictionary. */

	var visibleWords = sanitize($(document.body).children(":visible").text()).split(' ').filter(function(el) { return el.length != 0 });

	sanitizedVisibleText = visibleWords.join(' '); // the clean text used for actual matches later

	sanitizedUniqueVisibleWords = visibleWords.filter(function(elem, i, array){ return array.indexOf(elem) === i });

	portB2.postMessage({words: sanitizedUniqueVisibleWords}); // order the vectors via the vectorsLookup port
}

parseDom(); // we can start parsing the DOM without loading any functions below

var dl = DamerauLevenshtein({}, true); // instantiate the edit-distance object

var stopWords; // English stopwords
var portB1 = chrome.runtime.connect({name: "stopWordsLookup"});
portB1.postMessage({}); // ask to get stop words (from background page which loaded them from a json)
portB1.onMessage.addListener(function(msg) {
	stopWords = msg.stopWords;
});

chrome.runtime.onConnect.addListener(function(portP) {
	if (portP.name == "fromSendAndReceive") {
		portP.onMessage.addListener(function(msg) {
			var searchText = msg.searchText;
			lastSearchText = searchText; // update the last searched text

			clearHighlighting();
			searchText = sanitize(searchText);
			if (searchText.length > 0) {
				matches = getMatches(searchText, 10, 100);
				if (matches.length == 0) {
					matches = getMatches(searchText, 20, 200);	
				}
				portP.postMessage({matches: matches});
			} else {
				portP.postMessage({matches: []}); // send empty list back if nothing is in the searchText input box
			}
		});
		portP.onDisconnect.addListener(function(msg) {
			clearHighlighting();
		});
	} else if (portP.name == "getLastSearchText") {
		portP.onMessage.addListener(function(msg) {
			portP.postMessage({lastSearchText: lastSearchText});
		});
	} else if (portP.name == "scrollToMatch") {
		portP.onMessage.addListener(function(msg) {
			scrollToHighlite(msg.matchesSelectedCount);
		});
	}
});

function clearHighlighting() {
	unhighlite();
}

function scrollToHighlite(matchesSelectedCount) {
	if (highlited && highlited.length && highlited.length > 0 && previousMatchesSelectedCount < highlited.length) {
		highlited[previousMatchesSelectedCount].style.backgroundColor  = '#ffef14';
		var currentHighlited = highlited[matchesSelectedCount];
		currentHighlited.style.backgroundColor = '#00FF00';
		previousMatchesSelectedCount = matchesSelectedCount;

		currentHighlited.scrollIntoView();
		document.body.scrollTop -= (window.innerHeight / 2 );
	}
}

function expandSearchText(searchText, knn, radius) {
	var searchTextWords = searchText.split(' ');
	var searchTexts = [searchText]; // original search text must be returned no matter what

	portB2.postMessage({words: sanitizedUniqueVisibleWords});

	var substitutions = {};
	for (var i = 0; i < searchTextWords.length; i++) {
		substitutions[searchTextWords[i]] = [searchTextWords[i]]; // word is a substitute for itself
	}
	// following nested for-loop looks for words close in edit-distance to the search words to find substitutes
	for (var i = 0; i < searchTextWords.length; i++) {
		if (searchTextWords[i].length > 3) { // we only care if the word is at least 4 letters long (before we assume spelling mistakes are made)
			for (var j = 0; j < sanitizedUniqueVisibleWords.length; j++) {
				if (sanitizedUniqueVisibleWords[j].length > 2) {
					distance = dl(searchTextWords[i], sanitizedUniqueVisibleWords[j]);
					if (distance < 2) { // if there is only 1 atomic operation (insert, deletion, substitution, transposition) difference
						substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].concat([sanitizedUniqueVisibleWords[j]]);
					}
				}
			}
		}
		/* Performance condition. Any word shall only have at most 10 substitutions. */
		if (substitutions[searchTextWords[i]].length > 10) {
			substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].slice(0, 10);
		}
	}

	for (var i = 0; i < searchTextWords.length; i++) { // for every word in the searchText and
		/* We try to expand a word under the following conditions:
		(1) word must be larger than 2 characters (otherwise we waste time on words that probably don't help)
		(2) word is not in the stopWords list (we don't want to find all the similar words to "to", "i", etc.) and
		(3) word we are expanding is actually one we know the vector for */
		if (searchTextWords[i].length > 2 &&
			stopWords.words.indexOf(searchTextWords[i]) == -1 &&
			searchTextWords[i] in localWords2Vects) {

			var vector = localWords2Vects[searchTextWords[i]];
			var words = []; // where we keep all the similar words
			for (var j = 0; j < sanitizedUniqueVisibleWords.length; j++) { // for every unique word on the page
				/* The word expansions must also be:
				(1) similar word must be larger than 2 characters
				(2) not stop words themselves and
				(3) we must know the vector for them */
				if (sanitizedUniqueVisibleWords[j].length > 2 &&
					stopWords.words.indexOf(sanitizedUniqueVisibleWords[j]) == -1 && 
					sanitizedUniqueVisibleWords[j] in localWords2Vects) {
					// each element in words contains the similar word and the distance (score) between the vectors between the pair of words
					words[words.length] = {'word' : sanitizedUniqueVisibleWords[j], // the similar word
					'score' : getDistance(localWords2Vects[sanitizedUniqueVisibleWords[j]], vector)}; 
				}
			}
			words = words.sort(function(elem1, elem2) {
				return elem1.score - elem2.score; // sort the words array by the scores in ascending order
			}).slice(0, knn); // take the closest knn words (we do not care about their actual distance)
			words = words.filter(function(el) { return el.score < radius }); // now take the words which are at most `radius` units
			for (var j = 0; j < words.length; j++) {
				words[j] = words[j].word; // drop the distance attribute
			}
			substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].concat(words); // map the word in the searchText to an array of similar words
		}
		/* Performance condition. Any word shall only have at most 10 substitutions. */
		if (substitutions[searchTextWords[i]].length > 10) {
			substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].slice(0, 10);
		}

	}
	var substitutionsInOrder = []; // will hold our regular expression which has substitutions for each word in searchText
	for (var i = 0; i < searchTextWords.length; i++) {
		if (searchTextWords[i] in substitutions) { // check if we actually include a given word in our mapping
			substitutionsInOrder[substitutionsInOrder.length] = substitutions[searchTextWords[i]].join('|');
		} else {
			substitutionsInOrder[substitutionsInOrder.length] = searchTextWords[i];
		}
	}

	var regex = new RegExp('(' + substitutionsInOrder.join(') (') + ')', 'gi');
	do {
		/* We search through our visible text string (which we have from our preprocessing stage of parseDom) for matches 
		to our new regular expression. If any matches exist, we grab what they are. Later we will try to highlight these 
		specific on the actual tab. */
		m = regex.exec(sanitizedVisibleText);
		if (m) {
			searchTexts[searchTexts.length] = m[0]; // grab the substring that matches our regular expression
		}
	} while (m);
	searchTexts = searchTexts.filter(function(elem, i, array){ return array.indexOf(elem) === i }); // keep only unique matches
	searchTexts = searchTexts.filter(function(el) { return el.length != 0 }); // make sure we don't somehow end up with an empty string anywhere

	return searchTexts;
}

function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function hashCode(str) {
	/* Reference: http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery */
	var hash = 0;
	for (i = 0; i < str.length; i++) {
		char = str.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash;
	}
	return hash;
}

function getMatches(searchText, knn, radius) {
	/* First we call another function to potentially expand the searchText. In other words, an original searchText of
	'foo bar' might become ['foo bar', 'fum bar'] if this expansion determined that 'foo' is somehow similar to 'fum'.
	Each value in the returned array will be highlited and the results will be sent back to the popup. */
	var searchTexts = expandSearchText(searchText, knn, radius);

	highlite(searchTexts); // highlight original searchText and its expansions

	highlited = document.getElementsByClassName('fzbl_highlite');
	
	var matches = []; // will hold the match objects to be sent back to the popup
	var matches_by_hash = {}; // we count the number matches in each parent element 
	for (var i = 0; i < highlited.length; i++) {
		var parent = highlited[i].parentNode;
		// we hash the context and the match itself
		var hash = hashCode(parent.innerHTML.substring(0, 30)) + hashCode(highlited[i].innerHTML);
		if (hash in matches_by_hash) {
			matches_by_hash[hash].count += 1;
		} else {
			matches_by_hash[hash] = {count: 1, parent: parent, element: highlited[i]};
		}
		/* Performance condition. We shall care about the first 200 parent-match combinations only. */
		if (i > 200) {
			break;
		}
	}
	var id = 1; // we use 1-based ids because these will also become the labels in the popup and must be human readable
	for (var hash in matches_by_hash) { // go through each hash (combination or parent element and match)
		// try to find the start and end of the sentence with the current match
		var regex = new RegExp('([^.]{0,200}?)(' +escapeRegExp(matches_by_hash[hash].element.innerHTML)+')([^.]{0,100}\.{0,1})', 'gi');
		var parent = $(matches_by_hash[hash].parent).text();
		var count = matches_by_hash[hash].count; // the number of matches in the current parent element
		var j = 0;
		while (j < count) {
			var m = regex.exec(parent);
			if (m) {
				var text = m[1] + '<b>' + m[2] + '</b>' + m[3];
				matches[matches.length] = {id: id, thisMatch: matches_by_hash[hash].element.innerHTML, 
					context: text, element: matches_by_hash[hash].element};
				id += 1;
			}
			j += 1;
			if (matches.length > 100) {
				break;
			}
		}
		/* Performance condition. We shall care about the first 100 matches only. */
		if (matches.length > 100) {
			matches = matches.slice(0, 100);
		}
		
	}
	/* The following block sorts the matches array based on thisMatch attribute and 
	   how close it is to the original searchText based on the edit-distance score. */ 
	var cache = {};
	matches = matches.sort(function(elem1, elem2) {
		var a;
		if (elem1.thisMatch in cache) {
			a = cache[elem1.thisMatch];
		} else {
			a = dl(elem1.thisMatch, searchText.toLowerCase());
			cache[elem1.thisMatch] = a;
		}
		var b;
		if (elem2.thisMatch in cache) {
			b = cache[elem2.thisMatch];
		} else {
			b = dl(elem2.thisMatch, searchText.toLowerCase());
			cache[elem2.thisMatch] = b;
		}
		return a - b;
	});
	highlited = [];
	for (var i = 0; i < matches.length; i++) {
		highlited[highlited.length] = matches[i].element;
		matches[i].id = i + 1;
	}
	return matches;
}

function highlite(phrases) {
	for (var i = 0; i < phrases.length; i++) {
		phrases[i] = escapeRegExp(phrases[i]); // before matching, escape any regular expressions
	}
	phrases = phrases.join('|'); // look for any of the searchText expansions
	if (phrases.length > 0) {
		var pattern = '(' + phrases + ')';
		var regex = new RegExp(pattern, 'i');

		_highlite(document.body, regex);
	}
}

function _highlite(node, regex) {
	if (node.nodeType == 3) {
		var match = node.data.match(regex);
		if (match) {
			/* If there is a match, we will split the original node into three parts. 
			A node with text before the match, a node with the match text, and a node with text after the match. */
			var highlited = document.createElement('span'); // we will wrap our match inside a new span element
			highlited.className = 'fzbl_highlite'; // we give it this className
			highlited.style.backgroundColor = '#ffef14'; // and this becomes the background color for (non-active matches)
			var matchElement = node.splitText(match.index); // this becomes the node with the match text
			matchElement.splitText(match[0].length);
			var wordClone = matchElement.cloneNode(false); 
			highlited.appendChild(wordClone); // add the match text
			matchElement.parentNode.replaceChild(highlited, matchElement); // replace the middle node with the matchElement 
		}
	} else if (node.nodeType == 1 && 
			   node.childNodes.length > 0 &&
			   node.tagName != 'SCRIPT' && // don't change script tags
			   node.tagName != 'STYLE' && // don't change style tags
			   node.tagName != 'IMG' &&
			   node.className != 'fzbl_highlite') { // don't look at something we already inserted
		for (var i = 0; i < node.childNodes.length; i++) {
			_highlite(node.childNodes[i], regex);
		}
	}
}

function unhighlite() {
	var highlited = document.getElementsByClassName('fzbl_highlite');
	var elems = [];
	for (var i = 0; i < highlited.length; i++) {
		elems[i] = highlited[i];
	}
	for (var i = 0; i < elems.length; i++) {
		var parent = elems[i].parentNode;
		parent.replaceChild(elems[i].firstChild, elems[i]);
		parent.normalize();
	}
}

function getDistance(v1, v2) {
	var s = 0;
	for (var i = 0; i < v1.length; i++) {
		s += Math.pow(v1[i] - v2[i], 2);
	}
	return Math.sqrt(s);
}

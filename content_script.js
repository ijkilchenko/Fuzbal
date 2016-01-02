/* author: ijkilchenko@gmail.com
MIT license */

var sanitizedVisibleText; // holds all the visible text on current tab as a string (after sanitization)
var sanitizedUniqueVisibleWords; // array of the vocabulary of sanitized words on current tab
var localWords2Vects = {}; // subset of the whole word2vec dictionary of words that appear on current tab
var stopWords; // English stopwords

var highlited = []; // span elements which are currently highlighted
var lastSearchText = ''; // used to populate the popup after being closed
var doNotEscape = true; // are we searching using a regular expression?

var previousMatchesSelectedCount = 0;

function sanitize1(str) {
	// remove any "bad" character and lower case everything remaining and trim
	return str.replace(/[^a-zA-Z0-9" ]/g, "").toLowerCase().trim();
}
function sanitize2(str) {
	return str.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase().trim();
}

var portB2 = chrome.runtime.connect({name: "vectorsLookup"});
/* anytime we get a message back from background page under this port, we enrich our local word2vec dictionary
we can continuously look up the vectors for the search terms and add those definitions to localWords2Vects */
portB2.onMessage.addListener(function(msg) {
	for (var word in msg.localWords2Vects){
		localWords2Vects[word] = msg.localWords2Vects[word];
	}

	var portP2 = chrome.runtime.connect({name: "sendBackMatches"});
	if (lastSearchText.length > 0) {
		matches = getMatches(lastSearchText, 10); // only consider the top 10 nearest neighbors to each word on the page
		portP2.postMessage({matches: matches});
	} else {
		portP2.postMessage({matches: []}); // send empty list back if nothing is in the searchText input box
	}
});

var portB1 = chrome.runtime.connect({name: "stopWordsLookup"});
portB1.onMessage.addListener(function(msg) {
	stopWords = msg.stopWords;
});

function parseDom() {
	/* This function is run independently of whether or not the fuzbal popup is opened on a tab (every tab is thus parsed 
	right away in order to preprocess the text on the tab). We want to get the whole visible text of the tab, 
	sanitizedVisibleText, joined across every visible element on the page. We also want to find the vocabulary of the tab, 
	the unique words on the page, sanitizedUniqueVisibleWords, and use those to order a local word2vec dictionary. */

	sanitizedVisibleText = $(document.body).children(":visible").text();

	var visibleWords = sanitizedVisibleText.split(' ');

	var uniqueWords = new Set();
	visibleWords.forEach(function(word) {
		uniqueWords.add(sanitize2(word)); 
	});

	sanitizedUniqueVisibleWords = Array.from(uniqueWords);

	portB2.postMessage({words: sanitizedUniqueVisibleWords}); // order the vectors via the vectorsLookup port
	portB1.postMessage({}); // ask to get stop words (from background page which loaded them from a json)
}

parseDom(); // we can start parsing the DOM without loading any functions below

var dl = DamerauLevenshtein({}, true); // instantiate the edit-distance object

chrome.runtime.onConnect.addListener(function(portP) {
	if (portP.name == "fromSendAndReceive") {
		portP.onMessage.addListener(function(msg) {
			var searchText = msg.searchText;
			/* Performance condition: only keep the first 50 characters of a query */
			lastSearchText = searchText.substring(0, 50); // update the last searched text 

			clearHighlighting();
			var searchTextWords;
			// Check if we passed a regular expression (lastSearchText must start and end with a forward-slash)
			if (lastSearchText.slice(0, 1) == '/' && lastSearchText.slice(lastSearchText.length-1, lastSearchText.length) == '/' && lastSearchText.length > 2) {
				searchTextWords = [];
				doNotEscape = true;
			} else {
				searchText = sanitize1(lastSearchText); // sanitize but keep double quotes
				/* Performance condition: only keep the first 6 words of a query */
				searchTextWords = searchText.split(' ').splice(0, 6);
				doNotEscape = false;
			}
			portB2.postMessage({words: searchTextWords});
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
	if (highlited.length > 0 && previousMatchesSelectedCount < highlited.length) {
		highlited[previousMatchesSelectedCount].style.backgroundColor  = '#ffef14';
		var currentHighlited = highlited[matchesSelectedCount];
		currentHighlited.style.backgroundColor = '#00FF00';
		previousMatchesSelectedCount = matchesSelectedCount;

		currentHighlited.scrollIntoView();
		document.body.scrollTop -= (window.innerHeight / 2 );
	}
}

function expandSearchText(searchText, knn) {
	var searchTextWords = searchText.split(' ');
	var searchTexts = [searchText]; // original search text must be returned no matter what

	var substitutions = {};
	for (var i = 0; i < searchTextWords.length; i++) {
		substitutions[searchTextWords[i]] = [searchTextWords[i]]; // word is a substitute for itself
	}
	// following nested for-loop looks for words close in edit-distance to the search words to find substitutes
	for (var i = 0; i < searchTextWords.length; i++) {
		if (searchTextWords[i].slice(0, 1) == '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) == '"' && searchTextWords[i].length > 2) {
			substitutions[searchTextWords[i]] = [escapeRegExp(searchTextWords[i].slice(1, searchTextWords[i].length-1))];
		} else {
			if (searchTextWords[i].length > 3 &&  // we only care if the word is at least 4 letters long (before we assume spelling mistakes are made)
				stopWords.words.indexOf(searchTextWords[i]) == -1) {
				for (var j = 0; j < sanitizedUniqueVisibleWords.length; j++) {
					if (sanitizedUniqueVisibleWords[j].length > 3 &&
						stopWords.words.indexOf(sanitizedUniqueVisibleWords[j]) == -1) {
						distance = dl(searchTextWords[i], sanitizedUniqueVisibleWords[j]);
						if (distance < 2) { // if there is only 1 atomic operation (insert, deletion, substitution, transposition) difference
							substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].concat([sanitizedUniqueVisibleWords[j]]);
						}
					}
					/* Performance condition. Any word shall only have at most 10 substitutions. */
					if (substitutions[searchTextWords[i]].length > 10) {
						break;
					}
				}
			}
		}
		/* Performance condition. Any word shall only have at most 10 substitutions. */
		if (substitutions[searchTextWords[i]].length > 10) {
			substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].slice(0, 10);
		}
	}
	for (var i = 0; i < searchTextWords.length; i++) { // for every word in the searchText and their substitutions
		if (searchTextWords[i].slice(0, 1) == '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) == '"' && searchTextWords[i].length > 2) {
			substitutions[searchTextWords[i]] = [escapeRegExp(searchTextWords[i].slice(1, searchTextWords[i].length-1))];
		} else {
			for (var s = 0; s < substitutions[searchTextWords[i]].length; s++) {
				var sub = substitutions[searchTextWords[i]][s];
				/* We try to expand a word under the following conditions:
				(1) word must be larger than 3 characters (otherwise we waste time on words that probably don't help)
				(2) word is not in the stopWords list (we don't want to find all the similar words to "to", "i", etc.) and
				(3) word we are expanding is actually one we know the vector for */
				if (sub.length > 3 &&
					stopWords.words.indexOf(sub) == -1 &&
					sub in localWords2Vects) {

					var vector = localWords2Vects[sub];
					var words = []; // where we keep all the similar words
					for (var j = 0; j < sanitizedUniqueVisibleWords.length; j++) { // for every unique word on the page
						/* The word expansions must also be:
						(1) similar word must be larger than 2 characters
						(2) not stop words themselves and
						(3) we must know the vector for them */
						if (sanitizedUniqueVisibleWords[j].length > 3 &&
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
					words = words.filter(function(el) { return el.score < 100 }); // use only the words where the distance squared is less than 100
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
	//substitutionsInOrder = substitutionsInOrder.replace(/"/g, '');

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

var hashes = {};
function getMatches(searchText, knn) {
	/* First we call another function to potentially expand the searchText. In other words, an original searchText of
	'foo bar' might become ['foo bar', 'fum bar'] if this expansion determined that 'foo' is somehow similar to 'fum'.
	Each value in the returned array will be highlited and the results will be sent back to the popup. */
	if (doNotEscape == true) {
		var searchTexts = [searchText.slice(1, searchText.length-1)];
	} else {
		var searchTexts = expandSearchText(searchText, knn);
	}
	highlite(searchTexts); // highlight original searchText and its expansions

	highlited = document.getElementsByClassName('fzbl_highlite');

	var matches = []; // will hold the match objects to be sent back to the popup
	for (var i = 0; i < highlited.length; i++) {
		var siblings = [];
		var index;
		if (highlited[i].parentNode in hashes) {
			siblings = hashes[highlited[i].parentNode];
		} else {
			siblings = Array.from(highlited[i].parentNode.childNodes);
			hashes[highlited[i]] = siblings;
		}
		index = siblings.indexOf(highlited[i]);
		if (index > -1) {
			var left = '';
			if (index > 0) {
				left = $(siblings[index-1]).text();
				left = left.substring(left.length - 100, left.length);
				var m = left.match('[^.]{0,100}$');
				if (m) {
					left = m[0];
				}
			}
			var middle = highlited[i].innerHTML;
			var right = '';
			if (index < siblings.length-1) {
				right = $(siblings[index+1]).text();
				right = right.substring(0, 100);
				var m = right.match('^[^.]{0,100}\.{0,1}');
				if (m) {
					right = m[0];
				}
			}
			var text = left + '<b>' + middle + '</b>' + right;
			matches[matches.length] = {id: i, thisMatch: highlited[i].innerHTML, context: text, element: highlited[i]};
		}
		if (matches.length > 100) {
			matches = matches.slice(0, 100);
			break;
		}
	}
	/* The following block sorts the matches array based on thisMatch attribute and 
	how close it is to the original searchText based on the edit-distance score. */ 
	matches = mergeSort(matches, searchText); // we use our own stable sort (we need stable so that results appear in the correct order on the page)
	highlited = [];
	for (var i = 0; i < matches.length; i++) {
		highlited[highlited.length] = matches[i].element;
		matches[i].id = i;
	}
	return matches;
}

function highlite(phrases) {
	if (doNotEscape == true) {
		var regex = new RegExp(phrases[0], 'i');
		_highlite(document.body, regex);
	} else {
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
	} else if (node.nodeType == 1 && node.childNodes.length > 0 && node.tagName != 'SCRIPT' && node.tagName != 'STYLE' && node.tagName != 'IMG' && node.className != 'fzbl_highlite') { 
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
	return s;
}

function mergeSort(arr, searchText) {

	var length = arr.length;
	var middle = Math.floor(length / 2);

	if (length < 2) {
		return arr;
	} else {
		return merge(mergeSort(arr.slice(0, middle), searchText), mergeSort(arr.slice(middle, length), searchText), searchText);
	}
}

var mergeSortCache = {};
function compare(elem1, elem2, searchText) {
	var a;
	if (elem1.thisMatch in mergeSortCache) {
		a = mergeSortCache[elem1.thisMatch];
	} else {
		a = dl(elem1.thisMatch, searchText.toLowerCase());
		mergeSortCache[elem1.thisMatch] = a;
	}
	var b;
	if (elem2.thisMatch in mergeSortCache) {
		b = mergeSortCache[elem2.thisMatch];
	} else {
		b = dl(elem2.thisMatch, searchText.toLowerCase());
		mergeSortCache[elem2.thisMatch] = b;
	}
	return a -b;
}

function merge(left, right, searchText) {
	var result = [];

	while (left.length > 0 || right.length > 0) {
		if (left.length > 0 && right.length > 0) {
			if (compare(left[0], right[0], searchText) <= 0) {
				result.push(left[0]);
				left = left.slice(1);
			}
			else {
				result.push(right[0]);
				right = right.slice(1);
			}
		}
		else if (left.length > 0) {
			result.push(left[0]);
			left = left.slice(1);
		}
		else if (right.length > 0) {
			result.push(right[0]);
			right = right.slice(1);
		}
	}
	return result;
}

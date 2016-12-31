/* author: ijkilchenko@gmail.com
MIT license */

var visibleText; // Holds all the visible text on current tab as a string (after sanitization). 
var uniqueVisibleWords; // Array of the vocabulary of words on current tab. 
var localWords2Vects = {}; // Subset of the whole word vectors dictionary of words that appear on current tab.
var stopWords; // English stopwords.

var highlited = []; // Span elements which are currently highlighted. 
var lastSearchText = ''; // Used to populate the popup after being closed.
var doNotEscape = true; // Are we searching using a regular expression?

var properly_quoted_regex = /^(?:(?:\s{0,1}\"([^\s](?:(?!(?:\s\")).)*)\"(?=(?:\s|$)))|(?:(?!(?:.\"))[^\"]))*$/;

var lastResultSelectedIndex = 0;

var portB2 = chrome.runtime.connect({name: "vectorsLookup"});
/* Anytime we get a message back from background page under this port, we enrich our local word2vec dictionary.
We can continuously look up the vectors for the search terms and add those definitions to localWords2Vects */
portB2.onMessage.addListener(function(msg) {
	for (var word in msg.localWords2Vects){
		localWords2Vects[word] = msg.localWords2Vects[word];
	}

	var portP2 = chrome.runtime.connect({name: "sendBackResults"});
	var m = lastSearchText.match(properly_quoted_regex);
	if (lastSearchText.length > 0 && properly_quoted_regex.exec(lastSearchText)) {
		if (doNotEscape == false || (doNotEscape == true && !''.match(lastSearchText))) {
			var NUM_NEAREST_NEIGHBORS = 10;
			results = getResults(lastSearchText, NUM_NEAREST_NEIGHBORS); // Only consider the top N nearest neighbors to each word on the page.
			portP2.postMessage({results: results});
		} else {
			portP2.postMessage({results: []}); // Send empty list back if nothing is in the searchText input box. 
		}
	} else {
		portP2.postMessage({results: []}); // Send empty list back if nothing is in the searchText input box. 
	}
});

var portB1 = chrome.runtime.connect({name: "stopWordsLookup"});
portB1.onMessage.addListener(function(msg) {
	stopWords = msg.stopWords;
});

function parseDom() {
	/* This function is run independently of whether or not the fuzbal popup is opened on a tab (every tab is thus parsed
	right away in order to preprocess the text on the tab). We want to get the whole visible text of the tab,
	visibleText, joined across every visible element on the page. We also want to find the vocabulary of the tab,
	the unique words on the page, uniqueVisibleWords, and use those to order a local word2vec dictionary. */

	visibleText = $(document.body).children(":visible").text();

	var visibleWords = visibleText.split(' ');

	var uniqueWords = new Set();
	visibleWords.forEach(function(word) {
		uniqueWords.add(sanitize2(word));
	});

	uniqueVisibleWords = Array.from(uniqueWords);

	portB2.postMessage({words: uniqueVisibleWords}); // Order the vectors via the vectorsLookup port. 
}

parseDom(); // We can start parsing the DOM without loading any functions below.
portB1.postMessage({}); // Ask to get stop words (from background page which loaded them from a json). 

var levenshtein = DamerauLevenshtein({}, true); // Instantiate the edit-distance object. 
var mergeSortCache = {};

function isRegEx(searchText) {
	if (searchText.slice(0, 1) == '/' && searchText.slice(searchText.length-1, searchText.length) == '/' && searchText.length > 2) {
		return true;
	} else {
		return false;
	}
}

chrome.runtime.onConnect.addListener(function(portP) {
	if (portP.name == "fromSendAndReceive") {
		portP.onMessage.addListener(function(msg) {
			var searchText = msg.searchText;
			/* Performance condition: only keep the first N characters of a query. */
			var QUERY_MAX_LENGTH = 50;
			lastSearchText = searchText.substring(0, QUERY_MAX_LENGTH).toLowerCase().trim(); // Update the last searched text.

			clearHighlighting();
			var searchTextWords;
			// Check if we passed a regular expression (lastSearchText must start and end with a forward-slash). 
			if (isRegEx(searchText)) {
				searchTextWords = [];
				doNotEscape = true;
			} else {
				searchText = sanitize1(lastSearchText); // sanitize but keep double quotes
				/* Performance condition: only keep the first N words of a query.  */
				var MAX_NUM_WORDS_IN_QUERY = 6;
				searchTextWords = searchText.split(' ').splice(0, MAX_NUM_WORDS_IN_QUERY);
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
			scrollToHighlite(msg.resultSelectedIndex);
		});
	}
});

function clearHighlighting() {
	unhighlite();
}

function scrollToHighlite(resultSelectedIndex) {
	if (highlited.length > 0) {
		highlited[lastResultSelectedIndex].style.backgroundColor  = '#ffef14';
		var activeHighlited = highlited[resultSelectedIndex];
		activeHighlited.style.backgroundColor = '#00FF00';
		lastResultSelectedIndex = resultSelectedIndex;

		activeHighlited.scrollIntoView();
		document.body.scrollTop -= (window.innerHeight / 2 );
	}
}

function expandSearchText(searchText, knn) {
	var searchTexts = [searchText]; // Original search text must be returned no matter what. 
	var searchTextWords = searchText.split(' ');
	var searchTextWordsWithExacts = [];

	var numQuotes = (searchText.match(/"/g) || []).length;
	if (numQuotes % 2 == 0) {
		var left = -1;
		for (var i = 0; i < searchTextWords.length; i++) {
			if (!(searchTextWords[i].slice(0, 1) != '"' ^ searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) != '"')) {
				searchTextWordsWithExacts[searchTextWordsWithExacts.length] = searchTextWords[i];
			} else {
				if (searchTextWords[i].slice(0, 1) == '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) != '"') {
					var left = i;
				} else if (searchTextWords[i].slice(0, 1) != '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) == '"') {
					searchTextWordsWithExacts[searchTextWordsWithExacts.length] = searchTextWords.slice(left, i+1).join(' ');
				}
			}
		}
		searchTextWords = searchTextWordsWithExacts;
	} else {
		searchText = sanitize2(searchText);
		searchTextWords = searchText.split(' ');
	}

	var substitutions = {};
	for (var i = 0; i < searchTextWords.length; i++) {
		substitutions[searchTextWords[i]] = [searchTextWords[i]]; // Word is a substitute for itself. 
	}
	// Following nested for-loop looks for words close in edit-distance to the search words to find substitutes. 
	var MAX_SYNONYMS_PER_WORD = 10;
	for (var i = 0; i < searchTextWords.length; i++) {
		if (searchTextWords[i].slice(0, 1) == '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) == '"' && searchTextWords[i].length > 2) {
			substitutions[searchTextWords[i]] = [escapeRegExp(searchTextWords[i].slice(1, searchTextWords[i].length-1))];
		} else {
			if (searchTextWords[i].length > 3 &&  // We only care if the word is at least 4 letters long (before we assume spelling mistakes are made). 
				stopWords.words.indexOf(searchTextWords[i]) == -1) {
				for (var j = 0; j < uniqueVisibleWords.length; j++) {
					if (uniqueVisibleWords[j].length > 3 &&
						stopWords.words.indexOf(uniqueVisibleWords[j]) == -1) {
						distance = levenshtein(searchTextWords[i], uniqueVisibleWords[j]);
						if (distance < 2) { // If there is only 1 atomic operation (insert, deletion, substitution, transposition) difference. 
							substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].concat([uniqueVisibleWords[j]]);
						}
					}
					/* Performance condition. Any word shall only have at most N substitutions. */
					if (substitutions[searchTextWords[i]].length > MAX_SYNONYMS_PER_WORD) {
						break;
					}
				}
			}
		}
		/* Performance condition. Any word shall only have at most 10 substitutions. */
		if (substitutions[searchTextWords[i]].length > MAX_SYNONYMS_PER_WORD) {
			substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].slice(0, MAX_SYNONYMS_PER_WORD);
		}
	}
	for (var i = 0; i < searchTextWords.length; i++) { // For every word in the searchText and their substitutions.
		if (searchTextWords[i].slice(0, 1) == '"' && searchTextWords[i].slice(searchTextWords[i].length-1, searchTextWords[i].length) == '"' && searchTextWords[i].length > 2) {
			substitutions[searchTextWords[i]] = [escapeRegExp(searchTextWords[i].slice(1, searchTextWords[i].length-1))];
		} else {
			for (var s = 0; s < substitutions[searchTextWords[i]].length; s++) {
				var sub = substitutions[searchTextWords[i]][s];
				/* We try to expand a word under the following conditions:
				(1) word must be larger than N characters (otherwise we waste time on words that probably don't help), 
				(2) word is not in the stopWords list (we don't want to find all the similar words to "to", "i", etc.), and
				(3) word we are expanding is actually one we know the vector for. */
				var MIN_WORD_LENGTH_FOR_EXPANSION = 3;
				if (sub.length > MIN_WORD_LENGTH_FOR_EXPANSION &&
					stopWords.words.indexOf(sub) == -1 &&
					sub in localWords2Vects) {

					var vector = localWords2Vects[sub];
					var words = []; // Where we keep all the similar words.
					for (var j = 0; j < uniqueVisibleWords.length; j++) { // For every unique word on the page
						/* The word expansions must also be:
						(1) similar word must be larger than N characters, 
						(2) not stop words themselves, and
						(3) we must know the vector for them. */
						if (uniqueVisibleWords[j].length > MIN_WORD_LENGTH_FOR_EXPANSION  &&
							stopWords.words.indexOf(uniqueVisibleWords[j]) == -1 &&
							uniqueVisibleWords[j] in localWords2Vects) {
							// Each element in words contains the similar word and the distance (score) between the vectors between the pair of words. 
							words[words.length] = {'word' : uniqueVisibleWords[j], // The similar word. 
							'score' : getDistance(localWords2Vects[uniqueVisibleWords[j]], vector)};
						}
					}
					words = words.sort(function(elem1, elem2) {
						return elem1.score - elem2.score; // Sort the words array by the scores in ascending order. 
					}).slice(0, knn); // Take the closest knn words (we do not care about their actual distance). 
					var MAX_DISTANCE_AWAY = 100;
					words = words.filter(function(el) { return el.score < MAX_DISTANCE_AWAY }); // Use only the words where the distance squared is less than N. 
					for (var j = 0; j < words.length; j++) {
						words[j] = words[j].word; // Drop the distance attribute.
					}
					substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].concat(words); // map the word in the searchText to an array of similar words
				}
				/* Performance condition. Any word shall only have at most 10 substitutions. */
				if (substitutions[searchTextWords[i]].length > MAX_SYNONYMS_PER_WORD) {
					substitutions[searchTextWords[i]] = substitutions[searchTextWords[i]].slice(0, MAX_SYNONYMS_PER_WORD);
				}
			}
		}
	}
	var substitutionsInOrder = []; // Will hold our regular expression which has substitutions for each word in searchText. 
	for (var i = 0; i < searchTextWords.length; i++) {
		if (searchTextWords[i] in substitutions) { // Check if we actually include a given word in our mapping. 
			substitutionsInOrder[substitutionsInOrder.length] = substitutions[searchTextWords[i]].join('|');
		} else {
			substitutionsInOrder[substitutionsInOrder.length] = searchTextWords[i];
		}
	}

	var regex = new RegExp('(' + substitutionsInOrder.join(') (') + ')', 'gi');
	do {
		/* We search through our visible text string (which we have from our preprocessing stage of parseDom) for results
		to our new regular expression. If any results exist, we grab what they are. Later we will try to highlight these
		specific on the actual tab. */
		m = regex.exec(visibleText);
		if (m) {
			searchTexts[searchTexts.length] = m[0]; // Grab the substring that results our regular expression. 
		}
	} while (m);
	searchTexts = searchTexts.filter(function(elem, i, array){ return array.indexOf(elem) === i }); // Keep only unique results.
	searchTexts = searchTexts.filter(function(el) { return el.length != 0 }); // Make sure we don't somehow end up with an empty string anywhere.

	return searchTexts;
}

function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

var fuzbal_hashes = {};
function getResults(searchText, knn) {
	/* First we call another function to potentially expand the searchText. In other words, an original searchText of
	'foo bar' might become ['foo bar', 'fum bar'] if this expansion determined that 'foo' is somehow similar to 'fum'.
	Each value in the returned array will be highlited and the results will be sent back to the popup. */
	if (doNotEscape == true) {
		var searchTexts = [searchText.slice(1, searchText.length-1)];
	} else {
		var searchTexts = expandSearchText(searchText, knn);
	}
	highlite(searchTexts); // Highlight original searchText and its expansions.

	highlited = document.getElementsByClassName('fzbl_highlite');

	var results = []; // Will hold the match objects to be sent back to the popup.
	for (var i = 0; i < highlited.length; i++) {
		var siblings = [];
		var index;
		if (highlited[i].parentNode in fuzbal_hashes) {
			siblings = fuzbal_hashes[highlited[i].parentNode];
		} else {
			siblings = Array.from(highlited[i].parentNode.childNodes);
			fuzbal_hashes[highlited[i]] = siblings;
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
			results[results.length] = {id: i, thisResult: highlited[i].innerHTML, context: text, element: highlited[i]};
		}
		if (results.length > 100) {
			results = results.slice(0, 100);
			break;
		}
	}
	/* The following block sorts the results array based on thisResult attribute and
	how close it is to the original searchText based on the edit-distance score. */
	mergeSortCache = {};
	results = mergeSort(results, searchText); // We use our own stable sort (we need a stable sort so that results appear in the correct order on the page). 
	highlited = [];
	for (var i = 0; i < results.length; i++) {
		highlited[highlited.length] = results[i].element;
		results[i].id = i;
	}
	return results;
}

var numHighlited;
function highlite(phrases) {
	numHighlited = 0;
	if (doNotEscape == true) {
		var regex = new RegExp(phrases[0], 'i');
		_highlite(document.body, regex);
	} else {
		for (var i = 0; i < phrases.length; i++) {
			phrases[i] = escapeRegExp(phrases[i]); // Before matching, escape any regular expressions.
		}
		phrases = phrases.join('|'); // Look for any of the searchText expansions.
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
		var MAX_HIGHLIGHTED_RESULTS = 500;
		if (match && numHighlited < MAX_HIGHLIGHTED_RESULTS) {
			/* If there is a match, we will split the original node into three parts.
			A node with text before the match, a node with the match text, and a node with text after the match. */
			var highlited = document.createElement('span'); // We will wrap our match inside a new span element.
			highlited.className = 'fzbl_highlite'; // We give it this className.
			highlited.style.backgroundColor = '#ffef14'; // And this becomes the background color for (non-active results).
			var matchElement = node.splitText(match.index); // This becomes the node with the match text.
			matchElement.splitText(match[0].length);
			var wordClone = matchElement.cloneNode(false);
			highlited.appendChild(wordClone); // Add the match text.
			matchElement.parentNode.replaceChild(highlited, matchElement); // Replace the middle node with the matchElement.
			numHighlited += 1;
		}
	} else if (node.nodeType == 1 && node.childNodes.length > 0 && node.tagName != 'SCRIPT' && node.tagName != 'STYLE' && node.tagName != 'IMG' && node.className != 'fzbl_highlite') {
		for (var i = 0; i < node.childNodes.length; i++) {
			if (numHighlited < 500) {
				_highlite(node.childNodes[i], regex);
			}
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

function compare(elem1, elem2, searchText) {
	var a;
	if (elem1.thisResult in mergeSortCache) {
		a = mergeSortCache[elem1.thisResult];
	} else {
		a = levenshtein(elem1.thisResult.toLowerCase(), searchText.toLowerCase());
		mergeSortCache[elem1.thisResult] = a;
	}
	var b;
	if (elem2.thisResult in mergeSortCache) {
		b = mergeSortCache[elem2.thisResult];
	} else {
		b = levenshtein(elem2.thisResult.toLowerCase(), searchText.toLowerCase());
		mergeSortCache[elem2.thisResult] = b;
	}
	return a-b;
}

function merge(left, right, searchText) {
	var result = [];
	var left_i = 0;
	var right_i = 0;

	while (left.length > left_i || right.length > right_i) {
		if (left.length > left_i && right.length > right_i) {
			if (compare(left[left_i], right[right_i], searchText) <= 0) {
				result.push(left[left_i]);
				left_i = left_i + 1;
			}
			else {
				result.push(right[right_i]);
				right_i = right_i + 1;
			}
		}
		else if (left.length > left_i) {
			result.push(left[left_i]);
			left_i = left_i + 1;
		}
		else if (right.length > right_i) {
			result.push(right[right_i]);
			right_i = right_i + 1;
		}
	}
	return result;
}

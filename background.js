/* author: ijkilchenko@gmail.com
MIT license */

var vectors;
$.getJSON("./glove_small_dict.json", function(json) {
	vectors = json;
	console.log('word2vec dictionary loaded!');
});

chrome.runtime.onConnect.addListener(function(port) {
	console.assert(port.name == "vectorsLookup");
	port.onMessage.addListener(function(msg) {
		function subset(keys, dict) {
			dictSubset = {};
			for (var i = 0; i < keys.length; i++) {
				if (keys[i] in dict) {
					dictSubset[keys[i]] = dict[keys[i]];
				}
			}
			return dictSubset;
		}
		var localWords2Vects = {};
		if (msg.words && msg.words.length > 0) {
			localWords2Vects = subset(msg.words, vectors);
		}
		port.postMessage({localWords2Vects: localWords2Vects});
	});
});

var stopWords;
$.getJSON("./stopWords.json", function(json) {
	stopWords = json;
});

chrome.runtime.onConnect.addListener(function(port) {
	console.assert(port.name == "stopWordLookup");
	port.onMessage.addListener(function(msg) {
		port.postMessage({stopWords: stopWords});
	});
});

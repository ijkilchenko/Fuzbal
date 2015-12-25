/* author: ijkilchenko@gmail.com
MIT license */

var template = document.getElementById('template').innerHTML;
Mustache.parse(template);

var matchesSelectedCount = 0;
var lastMsgWithMatches;

function sendAndReceive() {
	var searchText = document.getElementById("searchText").value;

	if (searchText == "fuzbal help") {
		$(document.getElementById("matchesList")).hide();
		$(document.getElementById("helpTips")).show();
		document.getElementById("searchText").select();
	} else {
		$(document.getElementById("matchesList")).show();
		$(document.getElementById("helpTips")).hide();
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			var port = chrome.tabs.connect(tabs[0].id, {name: "fromSendAndReceive"});
			port.postMessage({searchText: searchText});
			port.onMessage.addListener(function(msg) {
				lastMsgWithMatches = msg;
				matchesSelectedCount = 0;
				render(msg, matchesSelectedCount);
			});
		});
	}
}

function render(msg, matchesSelectedCount) {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var port = chrome.tabs.connect(tabs[0].id, {name: "scrollToMatch"});
		port.postMessage({matchesSelectedCount: matchesSelectedCount});
	});

	var numMatches = msg.matches.length;
	var matchesBeforeSelected = [];
	var matchesSelected = [];
	var matchesAfterSelected = [];
	for (var i = 0; i < msg.matches.length; i++) {
		if (i < matchesSelectedCount) {
			matchesBeforeSelected[matchesBeforeSelected.length] = msg.matches[i];
		} else if (i == matchesSelectedCount) {
			matchesSelected[matchesSelected.length] = msg.matches[i];
		} else {
			matchesAfterSelected[matchesAfterSelected.length] = msg.matches[i];
		}
	}
	var rendered = '';
	if (numMatches > 0) {
		$(document.getElementById("matchesList")).show();
		if (numMatches > 99) {
			numMatches = 'many';
		}
		rendered = Mustache.render(template, {msg: {numMatches : numMatches, 
			matchesBeforeSelected: matchesBeforeSelected, matchesSelected: matchesSelected, matchesAfterSelected: matchesAfterSelected}});
	} else {
		$(document.getElementById("matchesList")).hide();
	}
	document.getElementById("matchesList").innerHTML = rendered;
}

if (document.addEventListener ){
	document.addEventListener("click", function(event){
		var targetElement = event.target || event.srcElement;
		do {
			if (targetElement.getAttribute('class') == 'matchItem') {
				matchesSelectedCount = targetElement.getAttribute('id') - 1;
				render(lastMsgWithMatches, matchesSelectedCount);
				break;
			} else {
				targetElement = targetElement.parentNode;
			}
		} while (targetElement.parentNode);
	});
} else if (document.attachEvent) {    
	document.attachEvent("onclick", function(){
		var targetElement = event.target || event.srcElement;
	});
}

document.getElementById("searchText").addEventListener("keyup", function(e) {
	if ([13, 37, 38, 39, 40].indexOf(e.keyCode) == -1) {
		sendAndReceive();
	} 
});

document.addEventListener("keyup", function(e) {
	if (e.keyCode == 13 || e.keyCode == 40) {
		if (lastMsgWithMatches) {
			matchesSelectedCount = (matchesSelectedCount + 1) % lastMsgWithMatches.matches.length;
			render(lastMsgWithMatches, matchesSelectedCount);
		}
	} else if (e.keyCode == 38) {
		if (lastMsgWithMatches) {
			matchesSelectedCount = matchesSelectedCount - 1;
			if (matchesSelectedCount == -1) {
				matchesSelectedCount = lastMsgWithMatches.matches.length - 1;
			}
			render(lastMsgWithMatches, matchesSelectedCount);
		}
	}
});

document.getElementById("help").addEventListener("click", function(e) {
	document.getElementById("searchText").value = "fuzbal help";
	sendAndReceive();
})

var tips = ['<b>Tip</b>: Use <b>Ctrl+Shift+K</b> to open/close the extension. ',
'<b>Info:</b> Synonyms and relate words are found locally in a dictionary file. ',
'<b>Tip:</b>: Press <ENTER> to go down the match list. ', 
'<b>Tip</b> Use up/down keys to cycle up and down the match list. ',
'<b>Info:</b> Edit distance between phrases gives roughly the number of letters out of place between the phrases. ',
'<b>Tip:</b> To search by synonyms and related words, be sure to enter your words fully. '];

window.onload = function() {
	document.getElementById("searchText").value = 'loading...';

	var tip = tips[Math.floor(Math.random() * tips.length)];

	document.getElementById("footer").innerHTML = '<center>' + tip + '</center>';

	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var port = chrome.tabs.connect(tabs[0].id, {name: "getLastSearchText"});
		port.postMessage({});
		port.onMessage.addListener(function(msg) {
			if (msg.lastSearchText.length > 0) {
				document.getElementById("searchText").value = msg.lastSearchText;
				document.getElementById("searchText").select();
				sendAndReceive();
			} else {
				document.getElementById("searchText").value = '';
				document.getElementById("searchText").focus();
			}
		});
	});
};

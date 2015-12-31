/* author: ijkilchenko@gmail.com
MIT license */

var template = document.getElementById('template').innerHTML;
Mustache.parse(template);

var matchesSelectedCount = 0;
var lastMsgWithMatches;

chrome.runtime.onConnect.addListener(function(port) {
	if (port.name == "sendBackMatches") {
		port.onMessage.addListener(function(msg) {
			handleMsg(msg);
		});
	}
});

function handleMsg(msg) {
	lastMsgWithMatches = msg;
	matchesSelectedCount = 0;
	render(msg, matchesSelectedCount);
}

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
				handleMsg(msg);
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

var tips = ['<b>Tip:</b> Try <b>Ctrl+Shift+K</b> (<b>Command</b> on a Mac) to open/close the extension or <a href="http://lifehacker.com/add-custom-keyboard-shortcuts-to-chrome-extensions-for-1595322121">set a custom shortcut</a> if this combination is already taken. ',
'<b>Info:</b> Synonyms and related words are found locally in a dictionary file. ',
'<b>Tip:</b> Clicking on a find result will scroll your window to where the result appears on the page. ', 
'<b>Tip:</b> Press ENTER to go down the match list. ', 
'<b>Tip:</b> Use UP/DOWN keys to cycle up and down the match list. ', 
'<b>Tip:</b> To search using regular expressions, start and end with "/" (e.g. /foob[ae]r/). ', 
'<b>Info:</b> The current find result is highlighted in green and others are highlighted in yellow. '];

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

$(document).ready(function(){
	$('body').on('click', 'a', function(){
		chrome.tabs.create({url: $(this).attr('href')});
		return false;
	});
});

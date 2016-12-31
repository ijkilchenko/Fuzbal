/* author: ijkilchenko@gmail.com
MIT license */

var template = $('#template').html(); // Hidden mustache template div. 
Mustache.parse(template);

// Save the jQuery objects to use later so jQuery doesn't have to re-query the dom. 
var $resultsList = $("#resultsList");
var $helpTips = $("#helpTips");
var $searchText = $("#searchText");
var $loadingIcon = $("#loadingIcon");

var resultSelectedIndex = 0; // Index of the active result (in green)., 
var lastMsg;

/* Listener for receiving messages from the content_script (run in a tab). */
chrome.runtime.onConnect.addListener(function(port) {
	if (port.name == "sendBackResults") {
		port.onMessage.addListener(function(msg) {
			updateResultsInPopup(msg);
		});
	}
});

function updateResultsInPopup(msg) {
	lastMsg = msg; // Save message (to be used when popup is reopened on a tab).
	resultSelectedIndex = 0; // Set first result to be the active result (in green).
	render(msg, resultSelectedIndex); // Update the mustache template.
}

function render(msg, resultSelectedIndex) {
	/* Scroll to the resulted selected. */
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var port = chrome.tabs.connect(tabs[0].id, {name: "scrollToMatch"});
		port.postMessage({resultSelectedIndex: resultSelectedIndex});
	});

	/* Partition the results into active and non-active results. */
	var resultsBeforeSelected = [];
	var resultsSelected = [];
	var resultsAfterSelected = [];
	for (var i = 0; i < msg.results.length; i++) {
		if (i < resultSelectedIndex) {
			resultsBeforeSelected[resultsBeforeSelected.length] = msg.results[i];
		} else if (i == resultSelectedIndex) {
			resultsSelected[resultsSelected.length] = msg.results[i];
		} else {
			resultsAfterSelected[resultsAfterSelected.length] = msg.results[i];
		}
	}

	var numResults = msg.results.length;
	if (numResults > 0) {
		$resultsList.show();
		var EXACT_RESULT_THRESHOLD = 99;
		if (numResults > EXACT_RESULT_THRESHOLD) { // Whenever we get more than N results, we do not display the actual number.
			numResults = 'Many';
		}
		var rendered = Mustache.render(template, {msg: {numResults : numResults,
			resultsBeforeSelected: resultsBeforeSelected, resultsSelected: resultsSelected, resultsAfterSelected: resultsAfterSelected}});
		$resultsList.html(rendered);
	} else {
		$resultsList.hide();
	}
	$loadingIcon.hide(); // Popup is updated with results so hide the loadingIcon. 
}

function sendAndReceive() {
	var searchText = $searchText.val();

	if (searchText == "fuzbal help") { // If our searchText indicates we want to bring up the help menu. 
		$resultsList.hide(); // Hide the resultsList and show the helpTips instead. 
		$helpTips.show();
		$searchText.select();
	} else {
		$helpTips.hide(); // Make sure to hide the helpTips always when help menu is not indicated. 
		$loadingIcon.show();
		$resultsList.show();
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			var port = chrome.tabs.connect(tabs[0].id, {name: "fromSendAndReceive"});
			port.postMessage({searchText: searchText});
			port.onMessage.addListener(function(msg) {
				updateResultsInPopup(msg);
			});
		});
	}
}

if (document.addEventListener){
	/* If anything in the popup is clicked and the element we clicked on is a matchItem... */
	document.addEventListener("click", function(event){
		var targetElement = event.target || event.srcElement;
		do {
			if (targetElement.getAttribute('class') == 'resultItem') {
				resultSelectedIndex = targetElement.getAttribute('id'); // Get the index of the result we clicked on (will be made active). 
				render(lastMsg, resultSelectedIndex); // Refill the mustache template with a new active result (also scrolls to active result on tab). 
				break;
			} else {
				targetElement = targetElement.parentNode; // Maybe we clicked on something *inside* the matchItem element. 
			}
		} while (targetElement.parentNode); // Traverse the element path up to the root and try to see if a matchItem element is an ancestor. 
	});
}

$searchText.on("keyup", function(e) {
	if ([13, 37, 38, 39, 40].indexOf(e.keyCode) == -1) {
		sendAndReceive(); // Send a message to the content_script (to ask for results) if none of these special keys are pressed. 
	}
});

$('#searchText').bind('input propertychange', function() {
   sendAndReceive(); // Perform a search when a click and paste action is detected. 
});

document.addEventListener("keyup", function(e) {
	if (e.keyCode == 13 || e.keyCode == 40) { // ENTER or DOWN. 
		if (lastMsg) { // If we have any results. 
			resultSelectedIndex = (resultSelectedIndex + 1) % lastMsg.results.length; // Cycle forward. 
			render(lastMsg, resultSelectedIndex);
		}
	} else if (e.keyCode == 38) { // UP. 
		if (lastMsg) {
			// Cycle backward. 
			resultSelectedIndex = resultSelectedIndex - 1;
			if (resultSelectedIndex == -1) {
				resultSelectedIndex = lastMsg.results.length - 1;
			}
			render(lastMsg, resultSelectedIndex);
		}
	}
});

/* Do something special when the help icon is clicked. */
$("#help").on("click", function(e) {
	$searchText.val("fuzbal help");
	sendAndReceive();
});

/* Run this block when the popup is opened. */
window.onload = function() {
	$searchText.val('Loading...');

	/* The lastSearchText is saved per tab so when opening the popup we can check if we already searched for something on this tab. */
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var port = chrome.tabs.connect(tabs[0].id, {name: "getLastSearchText"});
		port.postMessage({}); // The intention of this communication is always the same so we make the message empty.
		port.onMessage.addListener(function(msg) {
			if (msg.lastSearchText.length > 0) {
				$searchText.val(msg.lastSearchText);
				$searchText.select(); // Highlight the text in the input box so it's easier to type something new.
				sendAndReceive(); // Redo the search using the lastSearchText (we still need to rehighlight everything).
			} else {
				$searchText.val('');
				$searchText.focus();
			}
		});
	});
};

/* Open a new tab for links within the popup. */
$(document).ready(function(){
	$('body').on('click', 'a', function(){
		chrome.tabs.create({url: $(this).attr('href')});
		return false;
	});
});

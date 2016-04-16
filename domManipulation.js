
var domManipulation = (function () {
    var highlited = [];

    var numHighlited;

    function _highlite(node, regex) {
        if (node.nodeType == 3) {
            var match = node.data.match(regex);
            if (match && numHighlited < 500) {
                /* If there is a match, we will split the original node into three parts.
                 A node with text before the match, a node with the match text, and a node with text after the match. */
                var highlited = document.createElement('span'); // we will wrap our match inside a new span element
                highlited.className = 'fzbl_highlite'; // we give it this className
                highlited.style.backgroundColor = '#ffef14'; // and this becomes the background color for (non-active results)
                var matchElement = node.splitText(match.index); // this becomes the node with the match text
                matchElement.splitText(match[0].length);
                var wordClone = matchElement.cloneNode(false);
                highlited.appendChild(wordClone); // add the match text
                matchElement.parentNode.replaceChild(highlited, matchElement); // replace the middle node with the matchElement
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

    var highlite = function(phrases) {
        numHighlited = 0;
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

    };

    var unhighlite = function() {
        highlited = document.getElementsByClassName('fzbl_highlite');
        var elems = [];
        for (var i = 0; i < highlited.length; i++) {
            elems[i] = highlited[i];
        }
        for (var i = 0; i < elems.length; i++) {
            var parent = elems[i].parentNode;
            parent.replaceChild(elems[i].firstChild, elems[i]);
            parent.normalize();
        }
    };

    var scrollToHighlite = function(resultSelectedIndex) {
        highlited = document.getElementsByClassName('fzbl_highlite');
        if (highlited.length > 0) {
            highlited[lastResultSelectedIndex].style.backgroundColor  = '#ffef14';
            var activeHighlited = highlited[resultSelectedIndex];
            activeHighlited.style.backgroundColor = '#00FF00';
            lastResultSelectedIndex = resultSelectedIndex;

            activeHighlited.scrollIntoView();
            document.body.scrollTop -= (window.innerHeight / 2 );
        }
    };



    return {
        highlite: highlite,
        unhighlite: unhighlite,
        scrollToHighlite: scrollToHighlite
    };
}());

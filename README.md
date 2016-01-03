# Fuzbal v.0.99 (beta)

## Download The Extension
[Link to the Chrome Web Store.](https://chrome.google.com/webstore/detail/fuzbal/lidjpicdkcgjdkgifmmpalkibjeppdof) Once installed, go to any web-page, open the extension (try hitting **Ctrl+Shift+K** if that shortcut is not already used by your Chrome or [map your own](http://lifehacker.com/add-custom-keyboard-shortcuts-to-chrome-extensions-for-1595322121)), and use as you would use Ctrl+F. 

## Summary
Fuzbal (beta) is a Chome extension that gives Ctrl+F like find results which include non-exact (fuzzy) matches. The fuzziness comes from trying to add potentially misspellet words and words that are often seen together in context (synonyms). 

The former uses string edit distance ([Damerau–Levenshtein](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance)) while the latter uses [Stanford's GloVe](http://nlp.stanford.edu/projects/glove/) pre-trained word vectors. The dictionary file is included with the extension and so all searches are done locally. 

## Details
This GitHub project, still in beta (but under active development), is a complete collection of files which comprise a Chrome extension. The extension is meant to pick up where the usual Ctrl+F leaves off -- we try to add some non-exact matches because Ctrl+F is already great at returning exact ones. Whenever possible, we mimmic how Ctrl+F behaves in Chrome so as to make using the extension simple. We approach the problem of finding fuzzy matches with two main ideas for query expansion. 

### String Edit Distance 
We can try finding words which are misspellings. Without using some kind of a dictionary of common misspellings, we calculate the string edit distance between every pair of words on the page and find ones which are at most one mistake apart. So if you type `sholder` and the word `shoulder` happens to be on the page, `shoulder` will be part of the find results. We avoid this strategy of fuzziness under certain conditions aimed at better performance and we also do not calculate this distance between pairs of words where either word is too short. 

### Word Vectors
The more interesting strategy is to somehow look for synonyms or other related words. We avoid downloading a thesaurus, always having the Oxford Dictionary in memory, or doing searches using an online search engine. We instead load some kind of representations of 18 thousand most common words into memory which allow us to check just how closely related any pair of words is. The representation in our case is one of vectors and the operation which gives us the measure of just how closely related two words are is the calculation of the Euclidean distance between the vectorial representation of our two words. This kind of thing has been developed in the Natural Language Processing and the Machine Learning communities in the past few years and there are at least two popular implementations. One is [Word2Vec](https://code.google.com/p/word2vec/) and the other is [GloVe](http://nlp.stanford.edu/projects/glove/). These achieve similar outputs and, in this GitHub project, we chose to use GloVe only because we could find GloVe pre-trained word vectors of necessary size a little bit easier than Word2Vec word vectors (but, in fact, one can swap one for the other and Word2Vec was used at the start of this project instead). 

Using word vectors, if you type `prison` and `prison` is not on the page, but the word `jail` is, your find results will contain `jail`. These word vectors do not necessarily help us find synonyms, but rather related words (which often contain synonyms). As another example, if you typed in `Saudi`, your results will likely contain `Arabia` (or maybe `Egypt` or `oil`). 

With the 18 thousand most common words, the actual file size of these 50-dimensional vectors along with the whole extension is about 4 Mbs (zipped) which runs roughly at 50 Mbs in memory (half of what AdBlock uses, for example). 

### Ranking Results
The find results for all the expansions of the original query using the above two ideas is done using, again, string edit distance. This way, exact matches are towards the top while longer matches that don't share a lot of the same characters with the original string are towards the bottom. The ranking approach might change during beta. 

## Use Cases And Examples
Very often, once you Google something and go to the first result, you can't actually find the word that brought you there because Google ranks pages also using non-exact matches (along with a hoghepodge of other algorithms). The author, and probably many people, are then unable to find the exact part of the page that relates to the original search text. Using this extension, you can then find fuzzy find results on that page which brought you there in the first place. 

You could go to [Los Angeles Times](http://www.latimes.com/) and look for the word `terror`. Even if this word is not on the page, your find results will likely have to do with `terror` one way or another. Or you can use [New York Times](http://www.nytimes.com/), [Reddit/r/MachineLearning](https://www.reddit.com/r/MachineLearning/), [Hacker News](https://news.ycombinator.com/), etc. 

Search for the `the king` in the [full text of "Alice in Wonderland."](https://archive.org/stream/alicesadventures19033gut/19033.txt)

Really stress-test the extension by looking for the phrase `airplane flew` in the [full text of "1984."](http://msxnet.org/orwell/1984)

For the sake of performance, we limit the number of search results if there are many, many matches. Nobody cares to find all letters `e` on any page (but you still can find the first hundred!). 

## Regular Expression and Exact Matches Support
Whenever the user does need an exact match, just use double quotes around a word or words. For example, you can search for `"airplane" flew` instead of `airplane flew`. This should be intuitive because that's how you would make your results exact in Google search. 

You can search using regular expressions by surrounding your search text with `/`. For example, to look for 4-letter words that start with "d" and end with "e", type `/\sd[^\s]{2}e\s/`.

## Contact And Development
This is a hobby project of someone who dabbles in machine learning and primarily uses Python. **Note:** the author never used JavaScript before this project and so the code might look a little funky. Okay, a lot funky. There is an emphasis on "beta." Right now, we have some performance conditions, but we can expect some other edge cases not to be covered in terms of performance. 

Feel free to fork the project and make pull requests. JavaScript specific help is very welcomed (if there is anything that can be done simpler and faster, for example). Any changes made to the `master` branch will be published to the Chrome Web Store (manually by the author). All contributions will be clearly visible. 

Reach out directly to me via email `ijkilchenko` AT `gmail.com`.

### Long Term Issues
* PDFs are not supported. 

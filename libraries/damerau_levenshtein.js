/* Reference: https://github.com/cbaatz/damerau-levenshtein.git
   UNLICENSED */

function DamerauLevenshtein (prices, damerau) {
    // 'prices' customisation of the edit costs by passing an
    // object with optional 'insert', 'remove', 'substitute', and
    // 'transpose' keys, corresponding to either a constant
    // number, or a function that returns the cost. The default
    // cost for each operation is 1. The price functions take
    // relevant character(s) as arguments, should return numbers,
    // and have the following form:
    //
    // insert: function (inserted) { return NUMBER; }
    //
    // remove: function (removed) { return NUMBER; }
    //
    // substitute: function (from, to) { return NUMBER; }
    //
    // transpose: function (backward, forward) { return NUMBER; }
    //
    // The damerau flag allows us to turn off transposition and
    // only do plain Levenshtein distance.

    if (damerau !== false) damerau = true;
    if (!prices) prices = {};
    var insert, remove, substitute, transpose;

    switch (typeof prices.insert) {
    case 'function': insert = prices.insert; break;
    case 'number': insert = function (c) { return prices.insert; }; break;
    default: insert = function (c) { return 1; }; break; }

    switch (typeof prices.remove) {
    case 'function': remove = prices.remove; break;
    case 'number': remove = function (c) { return prices.remove; }; break;
    default: remove = function (c) { return 1; }; break; }

    switch (typeof prices.substitute) {
    case 'function': substitute = prices.substitute; break;
    case 'number':
        substitute = function (from, to) { return prices.substitute; };
        break;
    default: substitute = function (from, to) { return 1; }; break; }

    switch (typeof prices.transpose) {
    case 'function': transpose = prices.transpose; break;
    case 'number':
        transpose = function (backward, forward) { return prices.transpose; };
        break;
    default: transpose = function (backward, forward) { return 1; }; break; }

    function distance(down, across) {
        // http://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
        var ds = [];
        if ( down === across ) {
            return 0;
        } else {
            down = down.split(''); down.unshift(null);
            across = across.split(''); across.unshift(null);
            down.forEach(function (d, i) {
                if (!ds[i]) ds[i] = [];
                across.forEach(function (a, j) {
                    if (i === 0 && j === 0) ds[i][j] = 0;
                    // Empty down (i == 0) -> across[1..j] by inserting
                    else if (i === 0) ds[i][j] = ds[i][j-1] + insert(a);
                    // Down -> empty across (j == 0) by deleting
                    else if (j === 0) ds[i][j] = ds[i-1][j] + remove(d);
                    else {
                        // Find the least costly operation that turns
                        // the prefix down[1..i] into the prefix
                        // across[1..j] using already calculated costs
                        // for getting to shorter matches.
                        ds[i][j] = Math.min(
                            // Cost of editing down[1..i-1] to
                            // across[1..j] plus cost of deleting
                            // down[i] to get to down[1..i-1].
                            ds[i-1][j] + remove(d),
                            // Cost of editing down[1..i] to
                            // across[1..j-1] plus cost of inserting
                            // across[j] to get to across[1..j].
                            ds[i][j-1] + insert(a),
                            // Cost of editing down[1..i-1] to
                            // across[1..j-1] plus cost of
                            // substituting down[i] (d) with across[j]
                            // (a) to get to across[1..j].
                            ds[i-1][j-1] + (d === a ? 0 : substitute(d, a))
                        );
                        // Can we match the last two letters of down
                        // with across by transposing them? Cost of
                        // getting from down[i-2] to across[j-2] plus
                        // cost of moving down[i-1] forward and
                        // down[i] backward to match across[j-1..j].
                        if (damerau
                            && i > 1 && j > 1
                            && down[i-1] === a && d === across[j-1]) {
                            ds[i][j] = Math.min(
                                ds[i][j],
                                ds[i-2][j-2] + (d === a ? 0 : transpose(d, down[i-1]))
                            );
                        };
                    };
                });
            });
            return ds[down.length-1][across.length-1];
        };
    };
    return distance;
};

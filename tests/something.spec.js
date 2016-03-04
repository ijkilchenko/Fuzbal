/**
 * Created by hschroedl on 04.03.16.
 */
describe('highlighting', function () {
    'use strict';

    before(function () {
        this.$fixtures = $('<div id="fixtures" ></div>')
        $('body').append(this.$fixtures);
        this.$fixture = $('<div id="mocha-fixture"></div>');
    });

    beforeEach(function () {
        this.$fixture.empty().appendTo($('#fixtures'));
    });

    afterEach(function () {
        this.$fixture.empty();
    });

    describe('unhighlite', function () {

        it('should unhighlite highlighted text', function () {
            var highlitedText = $('<div id="textcontainer"><span class="fzbl_highlite">Sometext</span></div>');
            this.$fixture.append(highlitedText);
            domManipulation.unhighlite();

            var highlited = $('.fzbl_highlite');
            expect(highlited.length).to.equal(0);
        })
    });

});

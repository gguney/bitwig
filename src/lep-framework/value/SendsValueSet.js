/**
 * Represents a ValueSet of Sends for a given fix array of tracks,
 * i.e. other than {@link lep.SelectedTrackSendsValueSet}, this valueset allows control over
 * one send per track for multiple tracks at the same time.
 *
 * Author: Lennart Pegel - https://github.com/justlep
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 *
 * @constructor
 * @extends {lep.ValueSet}
 */
lep.SendsValueSet = lep.util.extendClass(lep.ValueSet, {
    /**
     * @param {string} name
     * @param {Track[]} tracks
     * @constructs
     */
    _init: function(name, tracks) {
        lep.util.assertArray(tracks, 'Invalid tracks array for SendsValueSet {}', this.name);
        lep.util.assert(tracks.length > 1, 'Invalid cursorDevice for SendsValueSet {}', this.name);
        lep.util.assertFunction(tracks[0].sendBank, 'Invalid track[0] for SendsValueSet {}', this.name);

        var self = this,
            _allSettableScrollPositions = [],
            _scrollable = null,
            _effectiveCurrentPage;

        this._super(name, tracks.length, 1, function(trackIndex) {
            var sendBank = tracks[trackIndex].sendBank();

            if (!trackIndex) {
                _scrollable = new lep.ScrollableView(name, 1, sendBank);
            }
            _allSettableScrollPositions.push(sendBank.scrollPosition());

            return new lep.StandardRangedValue({
                name: lep.util.formatString('{}-Send{}', name, trackIndex),
                rangedValue: sendBank.getItemAt(0)
            });
        });

        _effectiveCurrentPage = this.currentPage; // do not move up since `currentPage` is set by super-call

        /**
         * @override
         */
        this.currentPage = ko.computed({
            read: _effectiveCurrentPage,
            write: function(uncheckedNewPageIndex) {
                var checkedNewPageIndex = lep.util.limitToRange(uncheckedNewPageIndex, 0, self.lastPage());
                lep.logDev('setSendsPage({}) for {}', checkedNewPageIndex, self.name);
                for (var i = 0, len = _allSettableScrollPositions.length; i < len; i++) {
                    _allSettableScrollPositions[i].set(checkedNewPageIndex);
                }
            }
        });
        
        _scrollable.currentPosition.subscribe(_effectiveCurrentPage);
        _scrollable.totalItems.subscribe(function(total) {
            var lastPage = Math.max(0, total - 1);
            self.lastPage(lastPage);
        });

        lep.SendsValueSet._firstInstanceExists = true;
    }
});

/** @static */
lep.SendsValueSet._firstInstanceExists = false;

/**
 * @static
 * @param {TrackBank} trackBank
 * @return {SendsValueSet}
 */
lep.SendsValueSet.createFromTrackBank = function(trackBank) {
    var isFirstInstance = !lep.SendsValueSet._firstInstanceExists,
        name = isFirstInstance ? 'Sends' : 'Sends2',
        bankSize = trackBank.getSizeOfBank(),
        tracks = [];

    // two instances based on the same trackBank apparently share equals SendBank instance, hence cannot be moved independently
    // TODO check how to realize two independent SendsValueSets, best without "cloning" or adding trackbanks

    for (var i = 0, track; i < bankSize; i++) {
        track = trackBank.getItemAt(i);
        tracks.push(track);
    }
    return new lep.SendsValueSet(name, tracks);
};
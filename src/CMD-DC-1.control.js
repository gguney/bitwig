/**
 * Bitwig Controller Script for the Behringer CMD DC-1.
 *
 * Author: Lennart Pegel - https://github.com/justlep/bitwig
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 */

loadAPI(6);
load('lep-framework/complete.js');

host.defineController('Behringer', 'CMD DC-1', '2.1', '047f0d84-8ace-11e5-af63-feff819cdc9f', 'Lennart Pegel');
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(['CMD DC-1'], ['CMD DC-1']);

function init() {
    lep.setLogLevel(lep.LOGLEVEL.DEV);
    new lep.DC1();
}

/**
 * @constructor
 */
lep.DC1 = function() {

    var MIDI_CHANNEL = 5,
        NOTE = {
            PUSH_ENCODER_CLICK: 32,
            FIRST_TOP_BUTTON: 0, // ascending left-to-right, top-to-bottom; i.e. second row starting with 4
            FIRST_NUM_BUTTON: 16,
            PAD1: 36
        },
        CC = {
            PUSH_ENCODER: 32,
            FIRST_ENCODER: 16
        },
        NOTE_ACTION = {
            BANK_MODE: NOTE.FIRST_TOP_BUTTON + 4,
            PRESET_MODE: NOTE.FIRST_TOP_BUTTON + 5,
            SNAPSHOT_MODE: NOTE.FIRST_TOP_BUTTON + 6,
            APP_MODE: NOTE.FIRST_TOP_BUTTON + 1,
            SHIFT: NOTE.FIRST_TOP_BUTTON + 7
        },
        /**
         * Button color velocities. Push encoder color can not be changed.
         * Lights can't be turned off completely :(
         */
        COLOR = {
            ORANGE: 0,
            BLUE: 1,
            BLUE_BLINK: 2
        },
        prefs = {
            sendBankMSB: false,
            resetPresetOnBankChange: true,
            midiChannelForProgramChange: 0
        },
        application = host.createApplication(),
        isShiftButtonPressed = false,
        eventDispatcher = lep.MidiEventDispatcher.getInstance(),
        noteInput = eventDispatcher.createNoteInput('DC-1', 0, true),
        pushEncoderTarget = ko.observable(),
        isPushEncoderPressed = false,
        savedSnapshots = ko.observableArray(),
        currentSnapshot = ko.observable(0).extend({notify: 'always'}),
        lastClickedSnapshotIndex = 0,
        appModeButton,
        transport = host.createTransport(),
        currentBank = ko.computed({
            read: ko.computed(function() {
                return currentSnapshot() >> 8;
            }),
            write: function(newBank) {
                var newSnapshot = (newBank << 8) + (prefs.resetPresetOnBankChange ? 0 : currentPreset());
                currentSnapshot(newSnapshot);
            }
        }),
        currentPreset = ko.computed({
            read: ko.computed(function() {
                return currentSnapshot() & 0xff;
            }),
            write: function(newPreset) {
                var newSnapshot = (currentSnapshot() & 0xff00) + newPreset;
                currentSnapshot(newSnapshot);
            }
        }),
        isBankMode = ko.computed(function() {
            return (pushEncoderTarget() === currentBank);
        }),
        isPresetMode = ko.computed(function() {
            return (pushEncoderTarget() ===  currentPreset);
        }),
        isSnapshotMode = ko.computed(function() {
            return (pushEncoderTarget() === savedSnapshots);
        }),
        isAppMode = ko.computed(function() {
            return (pushEncoderTarget() === application);
        }),

        displayedBankPage = ko.observable(0),
        computedBankPage = ko.computed(function() {
            var bankPage = Math.floor(currentBank() / 16);
            displayedBankPage(bankPage);
            return bankPage;
        }),
        computedBankPad = ko.computed(function() {
            return currentBank() % 16;
        }),

        displayedPresetPage = ko.observable(0),
        computedPresetPage = ko.computed(function() {
            var presetPage = Math.floor(currentPreset() / 16);
            displayedPresetPage(presetPage);
            return presetPage;
        }),
        computedPresetPad = ko.computed(function() {
            return currentPreset() % 16;
        }),

        displayedSnapshotPage = ko.observable(0),

        CONTROL_SET = {
            NUM_BUTTONS: new lep.ControlSet('NumericButtons', 8, function(numButtonIndex) {
                return new lep.Button({
                    name: 'NumBtn' + (numButtonIndex + 1),
                    midiChannel: MIDI_CHANNEL,
                    clickNote: NOTE.FIRST_NUM_BUTTON + numButtonIndex
                });
            }),
            PADS: new lep.ControlSet('Pads', 16, function(padIndex) {
                return new lep.Button({
                    name: 'PadBtn' + (padIndex + 1),
                    midiChannel: MIDI_CHANNEL,
                    clickNote: NOTE.PAD1 + padIndex
                });
            })
        },
        VALUE_SET = {
            BANK_PAGES:  new lep.ValueSet('BankPageSet', 8, 1, function (index) {
                return new lep.KnockoutSyncedValue({
                    name: 'BankPage' + (index + 1),
                    ownValue: index,
                    refObservable: displayedBankPage,
                    computedVelocity: function() {
                        var isDisplayedPage = (index === displayedBankPage()),
                            isActivePage = (index === computedBankPage());

                        return (isDisplayedPage) ? COLOR.BLUE : (isActivePage) ? COLOR.BLUE_BLINK : COLOR.ORANGE;
                    }
                });
            }),
            PRESET_PAGES: new lep.ValueSet('PresetPageSet', 8, 1, function (index) {
                return new lep.KnockoutSyncedValue({
                    name: 'PresetPage' + (index + 1),
                    ownValue: index,
                    refObservable: displayedPresetPage,
                    computedVelocity: function() {
                        var isDisplayedPage = (index === displayedPresetPage()),
                            isActivePage = (index === computedPresetPage());

                        return (isDisplayedPage) ? COLOR.BLUE : (isActivePage) ? COLOR.BLUE_BLINK : COLOR.ORANGE;
                    }
                });
            }),
            SNAPSHOT_PAGES: new lep.ValueSet('SnapshotPageSet', 8, 1, function (index) {
                return new lep.KnockoutSyncedValue({
                    name: 'SnapshotPage' + (index + 1),
                    ownValue: index,
                    refObservable: displayedSnapshotPage,
                    velocityValueOn: COLOR.BLUE,
                    velocityValueOff: COLOR.OFF
                });
            }),
            BANKS: new lep.ValueSet('BanksValueSet', 16, 1, function(index) {
                return new lep.KnockoutSyncedValue({
                    name: 'BankVal' + (index + 1),
                    ownValue: index,
                    refObservable: computedBankPad,
                    computedVelocity: function() {
                        var isVisible = (displayedBankPage() === computedBankPage()),
                            isActive = isVisible && (currentBank() % 16 === index);

                        return isActive ? COLOR.BLUE : COLOR.ORANGE;
                    },
                    onClick: function(padIndex) {
                        var newBank = (displayedBankPage() * 16) + padIndex;
                        currentBank(newBank);
                    }
                });
            }),
            PRESETS: new lep.ValueSet('PresetValueSet', 16, 1, function(index) {
                return new lep.KnockoutSyncedValue({
                    name: 'PresetVal' + (index + 1),
                    ownValue: index,
                    refObservable: computedPresetPad,
                    computedVelocity: function() {
                        var isVisible = (displayedPresetPage() === computedPresetPage()),
                            isActive = isVisible && (currentPreset() % 16 === index);

                        return isActive ? COLOR.BLUE : COLOR.ORANGE;
                    },
                    onClick: function(padIndex) {
                        var newPreset = (displayedPresetPage() * 16) + padIndex;
                        currentPreset(newPreset);
                    }
                });
            }),
            SNAPSHOTS: new lep.ValueSet('SnapshotValueSet', 16, 1, function(index) {
                return new lep.KnockoutSyncedValue({
                    name: 'SnapshotVal' + (index + 1),
                    ownValue: index,
                    refObservable: computedPresetPad,
                    computedVelocity: function() {
                        var snapshotIndex = (displayedSnapshotPage() * 16) + index,
                            snapshot = savedSnapshots()[snapshotIndex],
                            isSnapshot = (typeof  snapshot === 'number'),
                            isActive = isSnapshot && (currentSnapshot() === snapshot);

                        return isActive ? COLOR.BLUE_BLINK : isSnapshot ? COLOR.BLUE : COLOR.ORANGE;
                    },
                    onClick: function(padIndex) {
                        var snapshotIndex = (displayedSnapshotPage() * 16) + padIndex,
                            /** @type {number } */
                            snapshotToSaveOrLoad;

                        lastClickedSnapshotIndex = snapshotIndex;

                        if (isShiftButtonPressed) {
                            // save snapshot..
                            snapshotToSaveOrLoad = currentSnapshot();
                            savedSnapshots()[snapshotIndex] = snapshotToSaveOrLoad;
                            savedSnapshots.valueHasMutated();
                            lep.logDebug('Saved snapshot {} in slot {}', snapshotToSaveOrLoad.toString(16), snapshotIndex);
                        } else {
                            // load snapshot..
                            /** @type {number} */
                            snapshotToSaveOrLoad = savedSnapshots()[snapshotIndex];
                            if (typeof snapshotToSaveOrLoad === 'number') {
                                currentSnapshot(snapshotToSaveOrLoad);
                                lep.logDebug('Loaded snapshot {} from slot {}', snapshotToSaveOrLoad.toString(16), snapshotIndex);
                            } else {
                                lep.logDebug('No snapshot in slot {}', snapshotIndex);
                            }
                        }
                    }
                });
            })
        };


    function initModeButtons() {
        // Bank Mode Button
        new lep.Button({
            name: 'BankModeButton',
            clickNote: NOTE_ACTION.BANK_MODE,
            midiChannel: MIDI_CHANNEL,
            valueToAttach: new lep.KnockoutSyncedValue({
                name: 'BankModeValue',
                ownValue: currentBank,
                refObservable: pushEncoderTarget,
                restoreRefAfterLongClick: true,
                velocityValueOn: COLOR.BLUE,
                velocityValueOff: COLOR.ORANGE
            })
        });

        // Preset Mode Button
        new lep.Button({
            name: 'PresetModeButton',
            clickNote: NOTE_ACTION.PRESET_MODE,
            midiChannel: MIDI_CHANNEL,
            valueToAttach: new lep.KnockoutSyncedValue({
                name: 'PresetModeValue',
                ownValue: currentPreset,
                refObservable: pushEncoderTarget,
                restoreRefAfterLongClick: true,
                velocityValueOn: COLOR.BLUE,
                velocityValueOff: COLOR.ORANGE
            })
        });

        new lep.Button({
            name: 'SnapshotModeButton',
            clickNote: NOTE_ACTION.SNAPSHOT_MODE,
            midiChannel: MIDI_CHANNEL,
            valueToAttach: new lep.KnockoutSyncedValue({
                name: 'SnapshotModeValue',
                ownValue: savedSnapshots,
                refObservable: pushEncoderTarget,
                restoreRefAfterLongClick: true,
                velocityValueOn: COLOR.BLUE,
                velocityValueOff: COLOR.ORANGE
            })
        });

        appModeButton = new lep.Button({
            name: 'AppModeButton',
            clickNote: NOTE_ACTION.APP_MODE,
            midiChannel: MIDI_CHANNEL,
            valueToAttach: new lep.KnockoutSyncedValue({
                name: 'AppModeValue',
                ownValue: application,
                refObservable: pushEncoderTarget,
                restoreRefAfterLongClick: true,
                velocityValueOn: COLOR.BLUE,
                velocityValueOff: COLOR.ORANGE
            })
        });

        eventDispatcher.onNote(NOTE_ACTION.SHIFT, function(note, value, channel) {
            isShiftButtonPressed = !!value;
            if (value) {
                sendNoteOn(channel, note, COLOR.BLUE_BLINK);
            } else {
                sendNoteOn(channel, note, COLOR.ORANGE);
            }
        }, null, MIDI_CHANNEL);
    }

    /**
     * @param {number} nextOrPrev - positive or negative
     */
    function loadNextOrPrevSnapshot(nextOrPrev) {
        var TOTAL_SNAPSHOTS = 8 * 16,
            direction = (nextOrPrev < 0) ? -1 : 1,
            _currentSnapshot = currentSnapshot(),
            _savedSnapshots = savedSnapshots(),
            startIndex = lastClickedSnapshotIndex + TOTAL_SNAPSHOTS,
            endIndex = startIndex + (TOTAL_SNAPSHOTS * direction);
        // lep.logDebug('Searching for snapshot, direction: {}, start: {}, end: {}', direction, startIndex, endIndex);
        for (var i = startIndex + direction, snapIndex, snap; i !== endIndex; i += direction) {
            snapIndex = (i % TOTAL_SNAPSHOTS);
            snap = _savedSnapshots[snapIndex];
            if ((typeof snap === 'number') && snap !== _currentSnapshot) {
                // lep.logDebug('Found next/prev snapshot {} at index {}', snap, snapIndex);
                lastClickedSnapshotIndex = snapIndex;
                currentSnapshot(snap);
                displayedSnapshotPage(Math.floor(snapIndex / 16));
                return;
            }
        }
        // lep.logDebug('No snap found');
    }

    function initPushEncoder() {
        // 'clicking' the push encoder resets the bank and/or preset..
        eventDispatcher.onNote(NOTE.PUSH_ENCODER_CLICK, function(note, value /*, channel */) {
            isPushEncoderPressed = !!value;

            if (isPushEncoderPressed) {
                if (isBankMode()) {
                    currentBank(0);
                } else if (isPresetMode()) {
                    currentPreset(0);
                } else if (isAppMode()) {
                    application.zoomToFit();
                }
            }
        });

        // 'twisting' the push encoder..
        eventDispatcher.onCC(CC.PUSH_ENCODER, function(cc, value /*, channel */){
            var targetObservable = pushEncoderTarget(),
                diff = (value - 64);

            if (isBankMode() || isPresetMode()) {
                var newBankOrPreset = lep.util.limitToRange(targetObservable() + diff, 0, 127);
                targetObservable(newBankOrPreset);
            } else if (isSnapshotMode() && diff) {
                loadNextOrPrevSnapshot(diff);
            } else if (isAppMode()) {
                if (diff < 0) {
                    if (appModeButton.isClicked) {
                        application.zoomOut();
                    } else {
                        transport.incPosition(-1, true);
                    }
                } else if (diff > 0) {
                    if (appModeButton.isClicked) {
                        application.zoomIn();
                    } else {
                        transport.incPosition(1, true);
                    }
                }
            }
        });

        // On mode change...
        pushEncoderTarget.subscribe(function(newTarget) {
            switch(newTarget) {
                case currentBank:
                    CONTROL_SET.NUM_BUTTONS.setValueSet(VALUE_SET.BANK_PAGES);
                    CONTROL_SET.PADS.setValueSet(VALUE_SET.BANKS);
                    break;
                case currentPreset:
                    CONTROL_SET.NUM_BUTTONS.setValueSet(VALUE_SET.PRESET_PAGES);
                    CONTROL_SET.PADS.setValueSet(VALUE_SET.PRESETS);
                    break;
                case savedSnapshots:
                    CONTROL_SET.NUM_BUTTONS.setValueSet(VALUE_SET.SNAPSHOT_PAGES);
                    CONTROL_SET.PADS.setValueSet(VALUE_SET.SNAPSHOTS);
            }
        });

        pushEncoderTarget(currentPreset);
    }

    function initPreferences() {
        var preferences = host.getPreferences(),
            bankMsbSetting = preferences.getEnumSetting('Send Bank MSB with ProgramChange', 'Preferences', ['YES','NO'], 'NO'),
            resetPresetSetting = preferences.getEnumSetting('Set Preset 0 on Bank changes', 'Preferences', ['YES','NO'], 'YES'),
            midiChannelSetting = preferences.getNumberSetting('MIDI channel for bank/program change messages', 'Preferences',
                0.0, 15.0, 1, '', 0);

        bankMsbSetting.addValueObserver(function(useMSB) {
            prefs.sendBankMSB = (useMSB === 'YES');
            lep.logDebug('Send MSB with ProgramChange: {}', prefs.sendBankMSB);
        });
        resetPresetSetting.addValueObserver(function(resetPreset) {
            prefs.resetPresetOnBankChange = (resetPreset === 'YES');
            lep.logDebug('Reset Preset on Bank change: {}', prefs.resetPresetOnBankChange);
        });
        midiChannelSetting.addValueObserver(16, function(newChannel) {
            prefs.midiChannelForProgramChange = (newChannel >> 0);
            lep.logDebug('New MIDI channel for bank/program change messages: {}', prefs.midiChannelForProgramChange);
        });
    }

    function initMidiProgramChangeSender() {
        var isFirstEvaluation = true;

        // Send MIDI ProgramChange (and bank change) messages when bank or preset changes
        ko.computed(function() {
            var snapshot = currentSnapshot(),
                bankToSend = (snapshot >> 8),
                presetToSend = (snapshot & 0xFF),
                channel = prefs.midiChannelForProgramChange;

            if (isFirstEvaluation) {
                // prevent the script from sending program change on start
                isFirstEvaluation = false;
                return;
            }

            lep.logDebug('Sending bank {} preset {} to MIDI channel {}', bankToSend, presetToSend, channel);

            if (prefs.sendBankMSB) {
                noteInput.sendRawMidiEvent(0xB0 + channel, 0, 0);        // Bank MSB
            }
            noteInput.sendRawMidiEvent(0xB0 + channel, 32, bankToSend);  // Bank LSB
            noteInput.sendRawMidiEvent(0xC0 + channel, presetToSend, 0); // ProgramChange
        });
    }

    initPreferences();
    initMidiProgramChangeSender();
    initModeButtons();
    initPushEncoder();

    println('\n--------------\nCMD DC-1 ready');
};


function exit() {
}
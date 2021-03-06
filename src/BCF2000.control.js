/**
 * Bitwig Controller Script for the Behringer BCF2000.
 *
 * Author: Lennart Pegel - https://github.com/justlep/bitwig
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 */

loadAPI(6);
load('lep-framework/complete.js');

host.defineController('Behringer', 'BCF2000', '2.3', 'd26515a4-571b-11e5-885d-feff819cdc9f', 'Lennart Pegel');
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(['BCF2000'], ['BCF2000']);
host.addDeviceNameBasedDiscoveryPair(['BCF2000 port 1'], ['BCF2000 port 1']);
host.addDeviceNameBasedDiscoveryPair(['BCF2000 Port 1'], ['BCF2000 Port 1']);

/**
 * Switches the BCF2000 into a given preset number.
 * @param {number} presetNumber - 1-based (!)
 */
function switchBcfToPreset(presetNumber) {
    var digit1 = '' + Math.floor(presetNumber/10),
        digit2 = '' + presetNumber % 10,
        sysexLines = [
            'F0 00 20 32 7F 7F 20 00 00 24 72 65 76 20 46 31 F7',
            'F0 00 20 32 7F 7F 20 00 01 F7',
            'F0 00 20 32 7F 7F 20 00 02 24 72 65 63 61 6C 6C 20 3X 3Y F7'.replace('X', digit1).replace('Y', digit2),
            'F0 00 20 32 7F 7F 20 00 03 F7',
            'F0 00 20 32 7F 7F 20 00 04 24 65 6E 64 F7'
        ];

    println('Switching BCF2000 to preset ' + presetNumber);

    // sending the switch command line by line (single line by join(' ') didn't work for whatever reason)
    sysexLines.forEach(sendSysex);
}

function init() {
    lep.setLogLevel(lep.LOGLEVEL.WARN);
    new lep.BCF2000(28, 12);
    // new lep.BCF2000(29, 13);
}

function exit() {
}

/**
 * @constructor
 * @param {number} bcfPresetNumber - BCF2000 preset (1-based)
 * @param {number} bcfMidiChannel - BCF2000 MIDI channel (0-based)
 */
lep.BCF2000 = function(bcfPresetNumber, bcfMidiChannel) {

    lep.util.assertNumberInRange(bcfPresetNumber, 1, 32, 'Invalid bcfPresetNumber for BCF2000');
    lep.util.assertNumberInRange(bcfMidiChannel, 0, 15, 'Invalid bcfMidiChannel for BCF2000');

    switchBcfToPreset(bcfPresetNumber);

    host.getNotificationSettings().getUserNotificationsEnabled().set(true);

    var WINDOW_SIZE = 8,
        SENDS_NUMBER = 6,
        USER_CONTROL_PAGES = 6,
        prefs = {
            soloExclusive: true
        },
        CC = {
            FIRST_ENCODER: 8,
            FIRST_FADER: 81
        },
        NOTE = {
            A1: 65,
            B1: 73,
            FIRST_ENCODER_CLICK: 33,
            EG1: 57, EG2: 58, EG3: 59, EG4: 60,
            F1: 53, F2: 54, F3: 55, F4: 56,
            T1: 49, T2: 50, T3: 51, T4: 52,
            P1: 63, P2: 64
        },
        NOTE_ACTION = {
            MODE_SOLO_MUTE: NOTE.EG1,
            MODE_VALUE_PAGE_SELECT: NOTE.EG2,
            MODE_ARM_SELECT: NOTE.EG3,
            MODE_VALUE_SELECT: NOTE.EG4,
            SHIFT: NOTE.F1,
            VU_METER: NOTE.F2,
            RECORD: NOTE.F3,
            LOOP: NOTE.F4,
            PREV_DEVICE_OR_CHANNEL_PAGE: NOTE.P1,
            NEXT_DEVICE_OR_CHANNEL_PAGE: NOTE.P2,
            PUNCH_IN: NOTE.T1,
            PUNCH_OUT: NOTE.T2,
            STOP_MUTEFADERS: NOTE.T3,
            PLAY: NOTE.T4
        },

        transport = lep.util.getTransport(),
        trackBank = host.createMainTrackBank(WINDOW_SIZE, SENDS_NUMBER, 0),
        tracksView = new lep.TracksView('Tracks', WINDOW_SIZE, SENDS_NUMBER, 0, trackBank),
        eventDispatcher = lep.MidiEventDispatcher.getInstance(),

        isShiftPressed = ko.observable(false),
        clearPunchOnStop = ko.observable(true),

        HANDLERS = {
            NEXT_DEVICE_OR_CHANNEL_PAGE: function() {
                if (isShiftPressed()) {
                    VALUESET.PARAM.selectNextDevice();
                } else {
                    tracksView.moveChannelPageForth();
                }
            },
            PREV_DEVICE_OR_CHANNEL_PAGE: function() {
                if (isShiftPressed()) {
                    VALUESET.PARAM.selectPreviousDevice();
                } else {
                    tracksView.moveChannelPageBack();
                }
            },
            SHIFT_CHANGE: function(note, value) {
                isShiftPressed(!!value);
            },
            PLAYING_STATUS_CHANGED: function(isPlaying) {
                if (!isPlaying && clearPunchOnStop()) {
                    if (TRANSPORT_VALUE.PUNCH_IN.value) {
                        transport.isPunchInEnabled().toggle();
                    }
                    if (TRANSPORT_VALUE.PUNCH_OUT.value) {
                        transport.isPunchOutEnabled().toggle();
                    }
                }
            }
        },

        VALUESET = {
            VOLUME: lep.ValueSet.createVolumeValueSet(trackBank, WINDOW_SIZE),
            PAN:    lep.ValueSet.createPanValueSet(trackBank, WINDOW_SIZE),
            SEND:   lep.SendsValueSet.createFromTrackBank(trackBank),
            SELECTED_TRACK_SENDS: new lep.SelectedTrackSendsValueSet(WINDOW_SIZE),
            PARAM:  new lep.ParamsValueSet(),
            USERCONTROL: lep.ValueSet.createUserControlsValueSet(USER_CONTROL_PAGES, WINDOW_SIZE, 'BCF-UC-{}-{}'),
            SOLO:   lep.ValueSet.createSoloValueSet(trackBank, WINDOW_SIZE, prefs),
            ARM:    lep.ValueSet.createArmValueSet(trackBank, WINDOW_SIZE),
            MUTE:   lep.ValueSet.createMuteValueSet(trackBank, WINDOW_SIZE),
            SELECT: lep.ValueSet.createSelectValueSet(trackBank, WINDOW_SIZE)
        },

        SWITCHABLE_VALUESETS = [
            VALUESET.VOLUME,
            VALUESET.PAN,
            VALUESET.SEND,
            VALUESET.SELECTED_TRACK_SENDS,
            VALUESET.PARAM,
            VALUESET.USERCONTROL
        ],

        // getNextFreeSwitchableValueSet = function() {
        //     for (var i = 0, valueSet; i < SWITCHABLE_VALUESETS.length; i++) {
        //         valueSet = SWITCHABLE_VALUESETS[i];
        //         if (!valueSet.isControlled()) {
        //             return valueSet;
        //         }
        //     }
        //     return null;
        // },

        initEncodersAndFadersValueSet = function() {
            CONTROLSET.ENCODERS.valueSet(VALUESET.PAN);
            CONTROLSET.FADERS.valueSet(VALUESET.VOLUME);
        },

        CONTROLSET = {
            ENCODERS: new lep.ControlSet('ClickEncoders', WINDOW_SIZE, function(index) {
                return new lep.ClickEncoder({
                    name: 'ClickEncoder' + index,
                    valueCC: CC.FIRST_ENCODER + index,
                    clickNote: NOTE.FIRST_ENCODER_CLICK + index,
                    midiChannel: bcfMidiChannel
                });
            }).withAutoSwap(),
            FADERS: new lep.ControlSet('Faders', WINDOW_SIZE, function(index) {
                return new lep.Fader({
                    name: 'Fader' + index,
                    valueCC: CC.FIRST_FADER + index,
                    midiChannel: bcfMidiChannel
                });
            }).withAutoSwap(),
            UPPER_BUTTONS: new lep.ControlSet('Upper Buttons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'UpperBtn' + index,
                    clickNote: NOTE.A1 + index,
                    midiChannel: bcfMidiChannel
                });
            }),
            LOWER_BUTTONS: new lep.ControlSet('Lower Buttons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'LowerBtn' + index,
                    clickNote: NOTE.B1 + index,
                    midiChannel: bcfMidiChannel
                });
            })
        },

        volumeMeter = new lep.VolumeMeter({
            tracksView: tracksView,
            overloadControlSet: CONTROLSET.ENCODERS,
            usePeak: false
        }),

        /**
         * ValueSets for the buttons selecting which value type (volume, pan etc) is assigned to the encoders/faders.
         * (!) The last two buttons do NOT represent value *type* but the -/+ buttons for the active value *PAGE*
         */
        createValueTypeSelectorValueSet = function(namePrefix, targetControlSet) {
            lep.util.assert(SWITCHABLE_VALUESETS.length);
            lep.util.assert(targetControlSet instanceof lep.ControlSet,
                'Invalid targetControlSet for createValueTypeSelectorValueSet(): {}', targetControlSet);

            return new lep.ValueSet(namePrefix + 'ValueTypeSelector', WINDOW_SIZE, 1, function(index) {
                var isPrevPageIndex = (index === WINDOW_SIZE-2),
                    isNextPageBtn = (index === WINDOW_SIZE-1),
                    switchableValueSet = !isPrevPageIndex && !isNextPageBtn && SWITCHABLE_VALUESETS[index];

                if (isPrevPageIndex) {
                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'PrevValuePage',
                        ownValue: true,
                        refObservable: targetControlSet.hasPrevValuePage,
                        onClick: targetControlSet.prevValuePage
                    });
                }
                if (isNextPageBtn) {
                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'NextValuePage',
                        ownValue: true,
                        refObservable: targetControlSet.hasNextValuePage,
                        onClick: targetControlSet.nextValuePage
                    });
                }
                if (switchableValueSet) {
                    var isParamsValueSet = switchableValueSet === VALUESET.PARAM,
                        isTrackSends = switchableValueSet === VALUESET.SELECTED_TRACK_SENDS,
                        isLockableValueSet = isParamsValueSet || isTrackSends;

                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'ValueTypeSelect-' + switchableValueSet.name,
                        ownValue: switchableValueSet,
                        refObservable: targetControlSet.valueSet,
                        computedVelocity: isLockableValueSet ? function() {
                            if (!isShiftPressed()) {
                                return (this.ownValue === this.refObservable()) ? 127 : 0;
                            }
                            var isLocked = isParamsValueSet ? switchableValueSet.lockedToDevice() : switchableValueSet.lockedToTrack();
                            return isLocked ? 127 : 0;
                        } : function() {
                            return (isShiftPressed() || this.ownValue !== this.refObservable()) ? 0: 127;
                        },
                        doubleClickAware: isLockableValueSet,
                        onClick: function(valueSet, refObs, isDoubleClick) {
                            var shiftPressed = isShiftPressed.peek();
                            if (!shiftPressed && !isDoubleClick && (valueSet !== refObs())) {
                                refObs(valueSet);
                            }
                            if (isParamsValueSet) {
                                if (shiftPressed) {
                                    valueSet.toggleDeviceWindow();
                                } else if (isDoubleClick) {
                                    valueSet.lockedToDevice.toggle();
                                }
                            } else if (isTrackSends && (isDoubleClick || shiftPressed)) {
                                valueSet.lockedToTrack.toggle();
                            }
                        }
                    });
                }
            });
        },

        VALUETYPE_BTN_VALUESET = {
            FOR_ENCODERS: createValueTypeSelectorValueSet('TopEncoders', CONTROLSET.ENCODERS),
            FOR_FADERS: createValueTypeSelectorValueSet('Faders', CONTROLSET.FADERS)
        },

        /**
         * ValueSets for the buttons selecting which value PAGE is active in the currently
         * attached valueSet of to the encoders/faders.
         */
        VALUEPAGE_BTN_VALUESET = {
            FOR_ENCODERS: new lep.ValueSet('EncoderValuePageSelect', WINDOW_SIZE, 1, function(index) {
                if (index >= WINDOW_SIZE-2) {
                    var prevOrNextValuePageBtnValue = VALUETYPE_BTN_VALUESET.FOR_ENCODERS.values[index];
                    lep.util.assert(prevOrNextValuePageBtnValue && prevOrNextValuePageBtnValue instanceof lep.KnockoutSyncedValue,
                                    'Unexpected type for VALUETYPE_BTN_VALUESET.FOR_ENCODERS.values[{}]', index);
                    return prevOrNextValuePageBtnValue;
                }
                return new lep.KnockoutSyncedValue({
                    name: 'EncoderValuePageSelect-' + index,
                    ownValue: index,
                    refObservable: CONTROLSET.ENCODERS.valuePage
                });
            }),
            FOR_FADERS: new lep.ValueSet('FaderValuePageSelect', WINDOW_SIZE, 1, function(index) {
                if (index >= WINDOW_SIZE-2) {
                    var prevOrNextValuePageBtnValue = VALUETYPE_BTN_VALUESET.FOR_FADERS.values[index];
                    lep.util.assert(prevOrNextValuePageBtnValue && prevOrNextValuePageBtnValue instanceof lep.KnockoutSyncedValue,
                                    'Unexpected type for VALUETYPE_BTN_VALUESET.FOR_FADERS.values[{}]', index);
                    return prevOrNextValuePageBtnValue;
                }
                return new lep.KnockoutSyncedValue({
                    name: 'FaderValuePageSelect-' + index,
                    ownValue: index,
                    refObservable: CONTROLSET.FADERS.valuePage
                });
            })
        },

        currentEncoderGroupMode = (function(){
            var _currentEncoderGroupMode = ko.observable();
            return ko.computed({
                read: _currentEncoderGroupMode,
                write: function(newGroupModeKey) {
                    lep.util.assertObject(ENCODER_GROUPS[newGroupModeKey], 'Unknown encoder groupModeKey: {}', newGroupModeKey);
                    lep.logDebug('Switching encoderGroupMode to "{}"', newGroupModeKey);
                    _currentEncoderGroupMode(newGroupModeKey);

                    var buttonValueSets = ENCODER_GROUPS[newGroupModeKey].BUTTON_VALUESETS,
                        lowerButtonValueSet = buttonValueSets.lower;

                    if (buttonValueSets.upper) {
                        CONTROLSET.UPPER_BUTTONS.setValueSet(buttonValueSets.upper);
                    }
                    if (lowerButtonValueSet) {
                        CONTROLSET.LOWER_BUTTONS.setValueSet(lowerButtonValueSet);
                    }
                }
            });
        })(),

        createGroupModeBtnValue = function(modeKey, valueName) {
            return new lep.KnockoutSyncedValue({
                name: valueName,
                ownValue: modeKey,
                refObservable: currentEncoderGroupMode,
                restoreRefAfterLongClick: true
            });
        },
        ENCODER_GROUPS = {
            SOLO_MUTE: {
                MODE_BTN_VALUE: createGroupModeBtnValue('SOLO_MUTE', 'Mode Solo/Mute'),
                BUTTON_VALUESETS: {upper: VALUESET.SOLO, lower: VALUESET.MUTE}
            },
            ARM_SELECT: {
                MODE_BTN_VALUE: createGroupModeBtnValue('ARM_SELECT', 'Mode Arm/Select'),
                BUTTON_VALUESETS: {upper: VALUESET.ARM, lower: VALUESET.SELECT}
            },
            VALUE_TYPE: {
                MODE_BTN_VALUE: createGroupModeBtnValue('VALUE_TYPE', 'Mode ValueType'),
                BUTTON_VALUESETS: {upper: VALUETYPE_BTN_VALUESET.FOR_ENCODERS, lower: VALUETYPE_BTN_VALUESET.FOR_FADERS}
            },
            VALUE_PAGE: {
                MODE_BTN_VALUE: createGroupModeBtnValue('VALUE_PAGE', 'Mode ValuePage'),
                BUTTON_VALUESETS: {upper: VALUEPAGE_BTN_VALUESET.FOR_ENCODERS, lower: VALUEPAGE_BTN_VALUESET.FOR_FADERS}
            }
        },

        initEncoderModeButtons = function() {
            new lep.Button({
                name: 'Mode Solo/Mute Btn',
                clickNote: NOTE_ACTION.MODE_SOLO_MUTE,
                midiChannel: bcfMidiChannel,
                valueToAttach: ENCODER_GROUPS.SOLO_MUTE.MODE_BTN_VALUE
            });
            new lep.Button({
                name: 'Mode Arm/Select Btn',
                clickNote: NOTE_ACTION.MODE_ARM_SELECT,
                midiChannel: bcfMidiChannel,
                valueToAttach: ENCODER_GROUPS.ARM_SELECT.MODE_BTN_VALUE
            });
            new lep.Button({
                name: 'Mode ValueType Btn',
                clickNote: NOTE_ACTION.MODE_VALUE_SELECT,
                midiChannel: bcfMidiChannel,
                valueToAttach: ENCODER_GROUPS.VALUE_TYPE.MODE_BTN_VALUE
            });
            new lep.Button({
                name: 'Mode ValuePage Btn',
                clickNote: NOTE_ACTION.MODE_VALUE_PAGE_SELECT,
                midiChannel: bcfMidiChannel,
                valueToAttach: ENCODER_GROUPS.VALUE_PAGE.MODE_BTN_VALUE
            });
            currentEncoderGroupMode('VALUE_TYPE');
        },

        initPreferences = function() {
            var preferences = host.getPreferences();
            var soloExclusiveValue = preferences.getEnumSetting('SOLO Exlusive', 'Preferences', ['ON','OFF'], 'OFF');
            soloExclusiveValue.addValueObserver(function(newValue) {
                prefs.soloExclusive = (newValue === 'ON');
                lep.logDebug('Toggled SOLO EXCLUSIVE {}', prefs.soloExclusive);
            });
        },
        TRANSPORT_VALUE = {
            PLAY: lep.ToggledTransportValue.getPlayInstance(),
            RECORD: lep.ToggledTransportValue.getRecordInstance(),
            ARRANGER_AUTOMATION: lep.ToggledTransportValue.getArrangerAutomationInstance(),
            LOOP: lep.ToggledTransportValue.getLoopInstance(),
            METRONOME: lep.ToggledTransportValue.getMetronomeInstance(),
            OVERDUB: lep.ToggledTransportValue.getOverdubInstance(),
            PUNCH_IN: lep.ToggledTransportValue.getPunchInInstance(),
            PUNCH_OUT: lep.ToggledTransportValue.getPunchOutInstance(),
            CLEAR_PUNCH_ON_STOP: new lep.KnockoutSyncedValue({
                name: 'ClearPunchInOutOnStop',
                ownValue: true,
                refObservable: clearPunchOnStop,
                onClick: function() {
                    clearPunchOnStop(!clearPunchOnStop());
                }
            })
        },
        initTransportButtons = function() {
            new lep.Button({
                name: 'PlayBtn',
                clickNote: NOTE_ACTION.PLAY,
                midiChannel: bcfMidiChannel,
                valueToAttach: TRANSPORT_VALUE.PLAY
            });
            new lep.Button({
                name: 'RecordBtn',
                clickNote: NOTE_ACTION.RECORD,
                midiChannel: bcfMidiChannel,
                valueToAttach: ko.computed(function() {
                    return isShiftPressed() ? TRANSPORT_VALUE.ARRANGER_AUTOMATION : TRANSPORT_VALUE.RECORD;
                })
            });
            new lep.Button({
                name: 'LockDeviceBtn',
                clickNote: NOTE_ACTION.VU_METER,
                midiChannel: bcfMidiChannel,
                valueToAttach: new lep.KnockoutSyncedValue({
                    name: 'VolumeMeterSwitch',
                    ownValue: true,
                    refObservable: volumeMeter.isEnabled,
                    onClick: function() {
                        if (isShiftPressed()) {
                            VALUESET.PARAM.toggleDeviceWindow();
                        } else {
                            volumeMeter.isEnabled.toggle();
                        }
                    }
                })
            });
            new lep.Button({
                name: 'PunchInBtn',
                clickNote: NOTE_ACTION.PUNCH_IN,
                midiChannel: bcfMidiChannel,
                valueToAttach: ko.computed(function() {
                    return isShiftPressed() ? TRANSPORT_VALUE.OVERDUB : TRANSPORT_VALUE.PUNCH_IN;
                })
            });
            new lep.Button({
                name: 'PunchOutBtn',
                clickNote: NOTE_ACTION.PUNCH_OUT,
                midiChannel: bcfMidiChannel,
                valueToAttach: ko.computed(function() {
                    return isShiftPressed() ? TRANSPORT_VALUE.CLEAR_PUNCH_ON_STOP : TRANSPORT_VALUE.PUNCH_OUT;
                })
            });
            new lep.Button({
                name: 'LoopBtn',
                clickNote: NOTE_ACTION.LOOP,
                midiChannel: bcfMidiChannel,
                valueToAttach: ko.computed(function() {
                    return isShiftPressed() ? TRANSPORT_VALUE.METRONOME : TRANSPORT_VALUE.LOOP;
                })
            });
            new lep.Button({
                name: 'StopBtn',
                clickNote: NOTE_ACTION.STOP_MUTEFADERS,
                midiChannel: bcfMidiChannel,
                valueToAttach: new lep.KnockoutSyncedValue({
                    name: 'Stop/MuteFaders',
                    ownValue: true,
                    refObservable: ko.computed(function(){
                        return isShiftPressed() && !CONTROLSET.FADERS.muted();
                    }),
                    onClick: function() {
                        if (isShiftPressed()) {
                            CONTROLSET.FADERS.muted.toggle();
                        } else {
                            transport.stop();
                        }
                    }
                })
            });

            transport.addIsPlayingObserver(HANDLERS.PLAYING_STATUS_CHANGED);
        };

    eventDispatcher.onNotePressed(NOTE_ACTION.NEXT_DEVICE_OR_CHANNEL_PAGE, HANDLERS.NEXT_DEVICE_OR_CHANNEL_PAGE);
    eventDispatcher.onNotePressed(NOTE_ACTION.PREV_DEVICE_OR_CHANNEL_PAGE, HANDLERS.PREV_DEVICE_OR_CHANNEL_PAGE);
    eventDispatcher.onNote(NOTE_ACTION.SHIFT, HANDLERS.SHIFT_CHANGE);

    initPreferences();
    initTransportButtons();
    initEncodersAndFadersValueSet();
    initEncoderModeButtons();

    println('\n-------------\nBCF2000 ready');
};

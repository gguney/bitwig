/**
 * Bitwig Controller Script for the Behringer X-Touch Compact.
 *
 * Author: Lennart Pegel - https://github.com/justlep/bitwig
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 */

loadAPI(6);
load('lep-framework/complete.js');

host.defineController('Behringer', 'X-Touch Compact', '1.0', '58169cfc-2228-11e8-b467-0ed5f89f718b', 'Lennart Pegel');
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(['X-TOUCH COMPACT'], ['X-TOUCH COMPACT']);

function init() {
    lep.setLogLevel(lep.LOGLEVEL.WARN);
    new lep.XTouchCompact();
}

/**
 * @constructor
 */
lep.XTouchCompact = function() {
    host.getNotificationSettings().getUserNotificationsEnabled().set(true);

    var MIDI_CHANNEL = 0,
        GLOBAL_MIDI_CHANNEL = 12,
        WINDOW_SIZE = 8,
        SENDS_NUMBER = 1,
        USER_CONTROL_PAGES = 6,
        prefs = {
            soloExclusive: true
        },
        CC = {
            TOP_ENCODER: 10,
            TOP_ENCODER_LED_MODE_GLOBAL: 10,
            FIRST_FADER_MOVE: 1,
            FIRST_FADER_TOUCH: 101,
            MAIN_FADER_MOVE: 9,
            MAIN_FADER_TOUCH: 109,
            RIGHT_ENCODER: 18,
            RIGHT_ENCODER_LED_MODE_GLOBAL: 18
        },
        NOTE = {
            BTN_TOP1_FIRST: 16,
            BTN_TOP1_FIRST_GLOBAL: 0,
            BTN_TOP2_FIRST: 24,
            BTN_TOP2_FIRST_GLOBAL: 8,
            BTN_TOP3_FIRST: 32,
            BTN_TOP3_FIRST_GLOBAL: 16,
            ENC_TOP_FIRST_CLICK: 0,
            ENC_RIGHT_FIRST_CLICK: 8,
            BTN_BOTTOM_FIRST: 40,
            BTN_BOTTOM_FIRST_GLOBAL: 24,
            BTN_LOOP: 51,
            BTN_LOOP_GLOBAL: 35,
            BTN_RECORD: 52,
            BTN_RECORD_GLOBAL: 36,
            BTN_REWIND: 49,
            BTN_REWIND_GLOBAL: 33,
            BTN_FORWARD: 50,
            BTN_FORWARD_GLOBAL: 34,
            BTN_STOP: 53,
            BTN_STOP_GLOBAL: 37,
            BTN_PLAY: 54,
            BTN_PLAY_GLOBAL: 38,
            BTN_MAIN: 48
        },
        NOTE_ACTION = {
            SHIFT: NOTE.BTN_MAIN,
            PREV_DEVICE_OR_CHANNEL_PAGE: NOTE.BTN_REWIND,
            NEXT_DEVICE_OR_CHANNEL_PAGE: NOTE.BTN_FORWARD
        },
        BUTTON_VALUE = {
            OFF: 0,
            ON: 2,
            BLINK: 3
        },
        ENCODER_LED_MODE = {
            SINGLE: 0,
            PAN: 1,
            FAN: 2,
            SPREAD: 3,
            TRIM: 4
        },
        XT_BUTTON_MODE = {
            MIXER: {isMixer: 1},
            CONTROLS: {isControls: 1},
            VALUE_PAGE: {isValuePage: 1} // TODO
        },
        keepMainConfig = ko.toggleableObservable(false),
        buttonMode = ko.observable(XT_BUTTON_MODE.MIXER);

    lep.ToggledValue.setAllDefaultVelocityValues(BUTTON_VALUE.ON, BUTTON_VALUE.OFF);
    lep.ChannelSelectValue.setVelocityValues(BUTTON_VALUE.ON, BUTTON_VALUE.OFF);
    lep.ToggledValue.setArmVelocityValues(BUTTON_VALUE.BLINK, BUTTON_VALUE.OFF);

    var transport = lep.util.getTransport(),
        trackBank = host.createMainTrackBank(WINDOW_SIZE, SENDS_NUMBER, 0),
        eventDispatcher = lep.MidiEventDispatcher.getInstance(),
        flushDispatcher = lep.MidiFlushDispatcher.getInstance(),
        tracksView = new lep.TracksView('Tracks', 8, 0, 0, trackBank),
        isLoopPressed = eventDispatcher.createNotePressedObservable(NOTE.BTN_LOOP, MIDI_CHANNEL),
        isShiftPressed = eventDispatcher.createNotePressedObservable(NOTE_ACTION.SHIFT, MIDI_CHANNEL),
        clearPunchOnStop = ko.toggleableObservable(true),

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

        CONTROLSET = {
            TOP_ENCODERS: new lep.ControlSet('TopEncoders', WINDOW_SIZE, function(index) {
                return new lep.ClickEncoder({
                    name: 'TopEncoder' + index,
                    valueCC: CC.TOP_ENCODER + index,
                    clickNote: NOTE.ENC_TOP_FIRST_CLICK + index,
                    midiChannel: MIDI_CHANNEL
                });
            }).withAutoSwap(),
            RIGHT_ENCODERS: new lep.ControlSet('RightEncoders', WINDOW_SIZE, function(index) {
                return new lep.ClickEncoder({
                    name: 'RightEncoder' + index,
                    valueCC: CC.RIGHT_ENCODER + index,
                    clickNote: NOTE.ENC_RIGHT_FIRST_CLICK + index,
                    midiChannel: MIDI_CHANNEL
                });
            }).withAutoSwap(),
            FADERS: new lep.ControlSet('Faders', WINDOW_SIZE, function(index) {
                return new lep.Fader({
                    name: 'Fader' + index,
                    valueCC: CC.FIRST_FADER_MOVE + index,
                    midiChannel: MIDI_CHANNEL,
                    muteOnTouch: true,
                    touchCC: CC.FIRST_FADER_TOUCH + index
                });
            }).withAutoSwap(),
            TOP1_BUTTONS: new lep.ControlSet('Top1Buttons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'Top1Btn' + index,
                    clickNote: NOTE.BTN_TOP1_FIRST + index,
                    midiChannel: MIDI_CHANNEL,
                    midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
                    clickNote4Sync: NOTE.BTN_TOP1_FIRST_GLOBAL + index
                });
            }),
            TOP2_BUTTONS: new lep.ControlSet('Top2Buttons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'Top2Btn' + index,
                    clickNote: NOTE.BTN_TOP2_FIRST + index,
                    midiChannel: MIDI_CHANNEL,
                    midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
                    clickNote4Sync: NOTE.BTN_TOP2_FIRST_GLOBAL + index
                });
            }),
            TOP3_BUTTONS: new lep.ControlSet('Top3Buttons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'Top3Btn' + index,
                    clickNote: NOTE.BTN_TOP3_FIRST + index,
                    midiChannel: MIDI_CHANNEL,
                    midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
                    clickNote4Sync: NOTE.BTN_TOP3_FIRST_GLOBAL + index
                });
            }),
            BOTTOM_BUTTONS: new lep.ControlSet('BottomButtons', WINDOW_SIZE, function(index) {
                return new lep.Button({
                    name: 'BottomBtn' + index,
                    clickNote: NOTE.BTN_BOTTOM_FIRST + index,
                    midiChannel: MIDI_CHANNEL,
                    midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
                    clickNote4Sync: NOTE.BTN_BOTTOM_FIRST_GLOBAL + index
                });
            })
        },

        volumeMeter = new lep.VolumeMeter({
            tracksView: tracksView,
            overloadControlSet: CONTROLSET.TOP_ENCODERS,
            //midiChannel: GLOBAL_MIDI_CHANNEL,
            //midiStartCC: 26,
            //maxMidiValue: 13,
            usePeak: false
        }),

        TRANSPORT_VALUE = {
            PLAY: lep.ToggledTransportValue.getPlayInstance().withVelocities(BUTTON_VALUE.BLINK, BUTTON_VALUE.OFF),
            RECORD: lep.ToggledTransportValue.getRecordInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            ARRANGER_AUTOMATION: lep.ToggledTransportValue.getArrangerAutomationInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            LOOP: lep.ToggledTransportValue.getLoopInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            METRONOME: lep.ToggledTransportValue.getMetronomeInstance().withVelocities(BUTTON_VALUE.BLINK, BUTTON_VALUE.OFF),
            OVERDUB: lep.ToggledTransportValue.getOverdubInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            PUNCH_IN: lep.ToggledTransportValue.getPunchInInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            PUNCH_OUT: lep.ToggledTransportValue.getPunchOutInstance().withVelocities(BUTTON_VALUE.ON, BUTTON_VALUE.OFF),
            CLEAR_PUNCH_ON_STOP: new lep.KnockoutSyncedValue({
                name: 'ClearPunchInOutOnStop',
                ownValue: true,
                refObservable: clearPunchOnStop,
                velocityValueOn: BUTTON_VALUE.ON,
                onClick: clearPunchOnStop.toggle
            })
        },

        createMainConfigValueSet = function() {
            return new lep.ValueSet('MainConfig', 8, 1, function(i) {
               switch (i) {
                   case 7:
                       return new lep.KnockoutSyncedValue({
                           name: 'ButtonModeSwitch',
                           ownValue: XT_BUTTON_MODE.CONTROLS,
                           refObservable: buttonMode,
                           velocityValueOn: BUTTON_VALUE.ON,
                           onClick: function(ownValue, refObs) {
                               var newButtonMode = (refObs.peek() === ownValue) ? XT_BUTTON_MODE.MIXER : XT_BUTTON_MODE.CONTROLS;
                               refObs(newButtonMode);
                           }
                       });
                   case 6:
                       return new lep.KnockoutSyncedValue({
                           name: 'ButtonModeSwitch',
                           ownValue: true,
                           refObservable: keepMainConfig,
                           velocityValueOn: BUTTON_VALUE.BLINK,
                           onClick: keepMainConfig.toggle
                       });
                   case 5:
                       return new lep.KnockoutSyncedValue({
                           name: 'VolumeMeterSwitch',
                           ownValue: true,
                           refObservable: volumeMeter.isEnabled,
                           velocityValueOn: BUTTON_VALUE.ON,
                           onClick: volumeMeter.isEnabled.toggle
                       });
                   case 0:
                       return TRANSPORT_VALUE.PUNCH_IN;
                   case 1:
                       return TRANSPORT_VALUE.PUNCH_OUT;
                   case 2:
                       return TRANSPORT_VALUE.CLEAR_PUNCH_ON_STOP;
                   default:
                       return new lep.KnockoutSyncedValue({
                           name: 'unused' + i,
                           ownValue: true,
                           refObservable: ko.observable(false)
                       });
               }
            });
        },
        VALUESET = {
            VOLUME: lep.ValueSet.createVolumeValueSet(trackBank, WINDOW_SIZE),
            PAN:    lep.ValueSet.createPanValueSet(trackBank, WINDOW_SIZE),
            SEND:   lep.SendsValueSet.createFromTrackBank(trackBank),
            SELECTED_TRACK_SENDS: new lep.SelectedTrackSendsValueSet(WINDOW_SIZE),
            PARAM:  new lep.ParamsValueSet(),
            USERCONTROL: lep.ValueSet.createUserControlsValueSet(USER_CONTROL_PAGES, WINDOW_SIZE, 'XTC-UC-{}-{}'),
            SOLO:   lep.ValueSet.createSoloValueSet(trackBank, WINDOW_SIZE, prefs),
            ARM:    lep.ValueSet.createArmValueSet(trackBank, WINDOW_SIZE),
            MUTE:   lep.ValueSet.createMuteValueSet(trackBank, WINDOW_SIZE),
            SELECT: lep.ValueSet.createSelectValueSet(trackBank, WINDOW_SIZE),
            MAIN_CONFIG: createMainConfigValueSet()
        },
        SWITCHABLE_VALUESETS = [
            VALUESET.VOLUME,
            VALUESET.PAN,
            VALUESET.SEND,
            VALUESET.SELECTED_TRACK_SENDS,
            VALUESET.PARAM,
            VALUESET.USERCONTROL
        ],
        VALUE = {
            MASTER_VOLUME: lep.StandardRangedValue.createMasterVolumeValue(),
            METRONOME_VOLUME: lep.StandardRangedValue.createMetronomeVolumeValue()
        },
        /**
         * ValueSets for the buttons selecting which value type (volume, pan etc) is assigned to the encoders/faders.
         * (!) The last two buttons do NOT represent value *type* but the -/+ buttons for the active value *PAGE*
         */
        createValueTypeSelectorValueSet = function(namePrefix, targetControlSet) {
            lep.util.assert(SWITCHABLE_VALUESETS.length);
            lep.util.assert(targetControlSet instanceof lep.ControlSet,
                'Invalid targetControlSet for createValueTypeSelectorValueSet(): {}', targetControlSet);

            var paramsModeSelectorBtnIndex = SWITCHABLE_VALUESETS.indexOf(VALUESET.PARAM),
                isParamsModeSelectorButtonInSameRowPressed = function(ksValue) {
                    var paramsModeSelectorBtn = ksValue.controller.parentControlSet.controls[paramsModeSelectorBtnIndex];
                    return paramsModeSelectorBtn.isClicked;
                };

            return new lep.ValueSet(namePrefix + 'ValueTypeSelector', WINDOW_SIZE, 1, function(index) {
                var isPrevPageIndex = (index === WINDOW_SIZE-2),
                    isNextPageBtn = (index === WINDOW_SIZE-1),
                    switchableValueSet = !isPrevPageIndex && !isNextPageBtn && SWITCHABLE_VALUESETS[index],
                    isParamsValueSet = switchableValueSet === VALUESET.PARAM,
                    isTrackSends = switchableValueSet === VALUESET.SELECTED_TRACK_SENDS,
                    isLockableValueSet = isParamsValueSet || isTrackSends;

                if (isPrevPageIndex) {
                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'PrevValuePage',
                        ownValue: true,
                        refObservable: targetControlSet.hasPrevValuePage,
                        onClick: function() {
                            if (isParamsModeSelectorButtonInSameRowPressed(this)) {
                                VALUESET.PARAM.lockedToPage.toggle();
                            } else {
                                targetControlSet.prevValuePage();
                            }
                        },
                        computedVelocity: function() {
                            var canSwitchPage = this.refObservable(),
                                isSwitchableLockedParamsPage = canSwitchPage && (targetControlSet.valueSet() === VALUESET.PARAM) &&
                                                                 VALUESET.PARAM.lockedToPage();
                            return canSwitchPage ? (isSwitchableLockedParamsPage ? BUTTON_VALUE.BLINK : BUTTON_VALUE.ON) : BUTTON_VALUE.OFF;
                        }
                    });
                }
                if (isNextPageBtn) {
                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'NextValuePage',
                        ownValue: true,
                        refObservable: targetControlSet.hasNextValuePage,
                        onClick: function() {
                            if (isParamsModeSelectorButtonInSameRowPressed(this)) {
                                VALUESET.PARAM.gotoDevice();
                                VALUESET.PARAM.toggleRemoteControlsSection();
                            } else {
                                targetControlSet.nextValuePage();
                            }
                        },
                        computedVelocity: function() {
                            var canSwitchPage = this.refObservable(),
                                isSwitchableLockedParamsPage = canSwitchPage && (targetControlSet.valueSet() === VALUESET.PARAM) &&
                                                                VALUESET.PARAM.lockedToPage();
                            return canSwitchPage ? (isSwitchableLockedParamsPage ? BUTTON_VALUE.BLINK : BUTTON_VALUE.ON) : BUTTON_VALUE.OFF;
                        }
                    });
                }
                if (switchableValueSet) {
                    return new lep.KnockoutSyncedValue({
                        name: namePrefix + 'ValueTypeSelect-' + switchableValueSet.name,
                        ownValue: switchableValueSet,
                        refObservable: targetControlSet.valueSet,
                        velocityValueOn: isLockableValueSet ? undefined : BUTTON_VALUE.ON,
                        computedVelocity: isLockableValueSet ? function() {
                            if (this.ownValue !== this.refObservable()) {
                                return BUTTON_VALUE.OFF;
                            }
                            var isLocked = isParamsValueSet ? switchableValueSet.lockedToDevice() :
                                           isTrackSends ? switchableValueSet.lockedToTrack() : false;
                            return isLocked ? BUTTON_VALUE.BLINK : BUTTON_VALUE.ON;
                        } : undefined,
                        doubleClickAware: isLockableValueSet,
                        onClick: function(valueSet, refObs, isDoubleClick) {
                            if (isParamsValueSet && hasMultipleParamsModeSelectorButtonsPressed()) {
                                VALUESET.PARAM.toggleDeviceWindow();
                            } else if (isDoubleClick) {
                                if (isTrackSends) {
                                    valueSet.lockedToTrack.toggle();
                                } else if (isParamsValueSet) {
                                    valueSet.lockedToDevice.toggle();
                                }
                            } else if (valueSet !== refObs()) {
                                refObs(valueSet);
                            }
                        }
                    });
                }
            });
        },

        VALUETYPE_SELECTOR_VALUESET = {
            FOR_TOP_ENCODERS: createValueTypeSelectorValueSet('TopEncoders', CONTROLSET.TOP_ENCODERS),
            FOR_RIGHT_ENCODERS: createValueTypeSelectorValueSet('RightEncoders', CONTROLSET.RIGHT_ENCODERS),
            FOR_FADERS: createValueTypeSelectorValueSet('Faders', CONTROLSET.FADERS)
        },

        CONTROL = {
            MAIN_FADER: (function() {
                var isMainFaderTouched = eventDispatcher.createCCPositiveObservable(CC.MAIN_FADER_TOUCH, MIDI_CHANNEL),
                    currentMainFaderValue = ko.computed(function() {
                        if (isLoopPressed() && isShiftPressed()) {
                            // holding shift+loop + touching the main fader should activate the Metronome in any case
                            if (isMainFaderTouched() && !TRANSPORT_VALUE.METRONOME.isOn) {
                                TRANSPORT_VALUE.METRONOME.togglingMethod();
                            }
                            return VALUE.METRONOME_VOLUME;
                        }
                        return VALUE.MASTER_VOLUME;
                    });

                return new lep.Fader({
                    name: 'MainFader',
                    valueCC: CC.MAIN_FADER_MOVE,
                    midiChannel: MIDI_CHANNEL,
                    valueToAttach: currentMainFaderValue
                });
            })()
        },

        hasMultipleParamsModeSelectorButtonsPressed = (function() {
            var selectorBtnIndex = SWITCHABLE_VALUESETS.indexOf(VALUESET.PARAM),
                paramsModeButton1 = CONTROLSET.TOP1_BUTTONS.controls[selectorBtnIndex],
                paramsModeButton2 = CONTROLSET.TOP2_BUTTONS.controls[selectorBtnIndex],
                paramsModeButton3 = CONTROLSET.TOP3_BUTTONS.controls[selectorBtnIndex];

            return function() {
                var totalClicked = (paramsModeButton1.isClicked && 1 || 0) +
                                   (paramsModeButton2.isClicked && 1 || 0) +
                                   (paramsModeButton3.isClicked && 1 || 0);
                return totalClicked > 1;
            };
        })();



    function initPreferences() {
        var preferences = host.getPreferences();
        var soloExclusiveValue = preferences.getEnumSetting('SOLO Exlusive', 'Preferences', ['ON','OFF'], 'OFF');
        soloExclusiveValue.addValueObserver(function(newValue) {
            prefs.soloExclusive = (newValue === 'ON');
            lep.logDebug('Toggled SOLO EXCLUSIVE {}', prefs.soloExclusive);
        });
    }

    function initTransportButtons() {
        new lep.Button({
            name: 'PlayBtn',
            clickNote: NOTE.BTN_PLAY,
            clickNote4Sync: NOTE.BTN_PLAY_GLOBAL,
            midiChannel: MIDI_CHANNEL,
            midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
            valueToAttach: ko.computed(function() {
                return isShiftPressed() ? TRANSPORT_VALUE.OVERDUB : TRANSPORT_VALUE.PLAY;
            })
        });
        new lep.Button({
            name: 'RecordBtn',
            clickNote: NOTE.BTN_RECORD,
            clickNote4Sync: NOTE.BTN_RECORD_GLOBAL,
            midiChannel: MIDI_CHANNEL,
            midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
            valueToAttach: ko.computed(function() {
                return isShiftPressed() ? TRANSPORT_VALUE.ARRANGER_AUTOMATION : TRANSPORT_VALUE.RECORD;
            })
        });

        new lep.Button({
            name: 'LoopBtn',
            clickNote: NOTE.BTN_LOOP,
            midiChannel: MIDI_CHANNEL,
            midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
            clickNote4Sync: NOTE.BTN_LOOP_GLOBAL,
            valueToAttach: ko.computed(function() {
                return isShiftPressed() ? TRANSPORT_VALUE.METRONOME : TRANSPORT_VALUE.LOOP;
            })
        });
        new lep.Button({
            name: 'StopBtn',
            clickNote: NOTE.BTN_STOP,
            midiChannel: MIDI_CHANNEL,
            midiChannel4Sync: GLOBAL_MIDI_CHANNEL,
            clickNote4Sync: NOTE.BTN_STOP_GLOBAL,
            valueToAttach: new lep.KnockoutSyncedValue({
                name: 'Stop/MuteFaders',
                ownValue: true,
                refObservable: ko.computed(function(){
                    return isShiftPressed() && !CONTROLSET.FADERS.muted();
                }),
                computedVelocity: function() {
                    return isShiftPressed() ? (CONTROLSET.FADERS.muted() ? BUTTON_VALUE.BLINK : BUTTON_VALUE.ON) : BUTTON_VALUE.OFF;
                },
                onClick: function() {
                    if (isShiftPressed()) {
                        CONTROLSET.FADERS.muted.toggle();
                        CONTROL.MAIN_FADER.setMuted(CONTROLSET.FADERS.muted.peek());
                    } else {
                        transport.stop();
                    }
                }
            })
        });
    }

    /**
     * Switch the LED ring display mode of the encoders depending on the value type it is currently attached to
     */
    function initEncoderLedRingsModeSwitching() {
        /**
         * @param {lep.ValueSet} newValueSet - the new ValueSet that just got attached to this ControlSet (this)
         * @this lep.ControlSet
         */
        var onEncodersValueSetChanged = function(newValueSet) {
            if (!newValueSet) {
                return;
            }
            var KEY = '__PREV_LED_MODE__',
                currentLedMode = this[KEY],
                newLedMode = (newValueSet === VALUESET.PAN) ? ENCODER_LED_MODE.TRIM : ENCODER_LED_MODE.FAN;

            if (newLedMode !== currentLedMode) {
                lep.logDebug('Setting LED mode of {} to {}', this.name, newLedMode);
                for (var i = this.controls.length-1, cc; i >= 0; i--) {
                    cc = this.controls[i].valueCC4Sync; // encoder led mode global CCs equal the encoder CCs
                    sendChannelController(GLOBAL_MIDI_CHANNEL, cc, newLedMode);
                }
                this[KEY] = newLedMode;
            }
        };

        CONTROLSET.TOP_ENCODERS.valueSet.subscribe(onEncodersValueSetChanged, CONTROLSET.TOP_ENCODERS);
        CONTROLSET.RIGHT_ENCODERS.valueSet.subscribe(onEncodersValueSetChanged, CONTROLSET.RIGHT_ENCODERS);
    }

    // ====================== Init ======================

    initPreferences();
    transport.addIsPlayingObserver(HANDLERS.PLAYING_STATUS_CHANGED);
    eventDispatcher.onNotePressed(NOTE_ACTION.NEXT_DEVICE_OR_CHANNEL_PAGE, HANDLERS.NEXT_DEVICE_OR_CHANNEL_PAGE);
    eventDispatcher.onNotePressed(NOTE_ACTION.PREV_DEVICE_OR_CHANNEL_PAGE, HANDLERS.PREV_DEVICE_OR_CHANNEL_PAGE);

    flushDispatcher.onFirstFlush(function() {
        initTransportButtons();
        initEncoderLedRingsModeSwitching();

        CONTROLSET.TOP1_BUTTONS.setObservableValueSet(ko.computed(function() {
            return buttonMode().isMixer ? VALUESET.SOLO : VALUETYPE_SELECTOR_VALUESET.FOR_TOP_ENCODERS;
        }));
        CONTROLSET.TOP2_BUTTONS.setObservableValueSet(ko.computed(function() {
            return buttonMode().isMixer ? VALUESET.MUTE : VALUETYPE_SELECTOR_VALUESET.FOR_RIGHT_ENCODERS;
        }));
        CONTROLSET.TOP3_BUTTONS.setObservableValueSet(ko.computed(function() {
            return buttonMode().isMixer ? VALUESET.ARM : VALUETYPE_SELECTOR_VALUESET.FOR_FADERS;
        }));

        CONTROLSET.BOTTOM_BUTTONS.setObservableValueSet(ko.computed(function() {
            return (isShiftPressed() || keepMainConfig()) ? VALUESET.MAIN_CONFIG :
                   buttonMode().isMixer ? VALUESET.SELECT : VALUESET.SELECT; // TODO
        }));

        buttonMode(XT_BUTTON_MODE.CONTROLS);

        CONTROLSET.FADERS.valueSet(VALUESET.VOLUME);
        CONTROLSET.TOP_ENCODERS.valueSet(VALUESET.PAN);
        CONTROLSET.RIGHT_ENCODERS.valueSet(VALUESET.PARAM);

        // TODO move functionality to proper place
        // eventDispatcher.onNotePressed(NOTE.BTN_BOTTOM_FIRST + 6, VALUESET.PARAM.gotoDevice, null, MIDI_CHANNEL);

        println('\n-------------\nX-Touch Compact ready');
    });

    println('\n-------------\nX-Touch Compact waiting for first flush...');
};

function exit() {
}
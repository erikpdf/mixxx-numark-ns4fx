////////////////////////////////////////////////////////////////////////
// JSHint configuration                                               //
////////////////////////////////////////////////////////////////////////
/* global engine                                                      */
/* global script                                                      */
/* global print                                                       */
/* global midi                                                        */
////////////////////////////////////////////////////////////////////////


/******************
 * CONFIG OPTIONS *
 ******************/

// should wheel be enabled on startup?
var EnableWheel = true;

// should we use the manual loop buttons as hotcue buttons 5-8?
var UseManualLoopAsCue = false;

// should we use the auto loop buttons as hotcue buttons 5-8?
var UseAutoLoopAsCue = false;

// should we use the hotcue buttons for samplers 5-8?
var UseCueAsSampler = false;

// should shift+load eject or load and play?
var ShiftLoadEjects = true;

// should we show effect parameters when an effect is focused?
var ShowFocusedEffectParameters = false;

//use effect on deck 1+3 and 2+4 or just on active deck?
var OnlyActiveDeckEffect = false;

//show vu meters for both deck 1+3 and 2+4 or from current deck
var displayVUFromBothDecks = false;

var NS4FX = {};

NS4FX.init = function(id, debug) {
    
    NS4FX.id = id;
    NS4FX.debug = debug;
    //deck switching sends the command 2 times, from current and next
    NS4FX.ignore_deck_switch = true;

    //effects
    NS4FX.effectUnit = new NS4FX.EffectUnit();
    var effects = [
        {unit: 1, slot: 1, id: 9, meta:0.9},
        { unit: 1, slot: 2, id: 9, meta:0.1},
        {unit: 1, slot: 3, id: 10, meta:1},
        {unit: 2, slot: 1, id: 8, meta:1},
        {unit: 2, slot: 2, id:12, meta:1},
        {unit: 2, slot: 3, id:18, meta:1}
    ];

    effects.forEach(function(effect) {
        var group = '[EffectRack1_EffectUnit' + effect.unit + '_Effect' + effect.slot + ']';
        engine.setParameter(group, 'meta', effect.meta);
        engine.setValue(group, "clear", 1);
        for (var i = 0; i < effect.id; ++i) {
            engine.setValue(group, "effect_selector", 1);
        }
        
    });

    // decks
    NS4FX.decks = new components.ComponentContainer();
    NS4FX.decks[1] = new NS4FX.Deck(1, 0x00);
    NS4FX.decks[2] = new NS4FX.Deck(2, 0x01);
    NS4FX.decks[3] = new NS4FX.Deck(3, 0x02);
    NS4FX.decks[4] = new NS4FX.Deck(4, 0x03);

    // set up two banks of samplers, 4 samplers each
    if (engine.getValue("[App]", "num_samplers") < 8) {
        engine.setValue("[App]", "num_samplers", 8);
    }
    NS4FX.sampler_all = new components.ComponentContainer();
    NS4FX.sampler_all[1] = new NS4FX.Sampler(1);
    NS4FX.sampler_all[2] = new NS4FX.Sampler(5);

    NS4FX.sampler = NS4FX.sampler_all[1];
    NS4FX.sampler_all[2].forEachComponent(function(component) {
        component.disconnect();
    });


    // headphone gain
    NS4FX.head_gain = new NS4FX.HeadGain(NS4FX.sampler_all);

    // exit demo mode
    var byteArray = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x3A, 0x60, 0x00, 0x04, 0x04, 0x01, 0x00, 0x00, 0xF7];
    midi.sendSysexMsg(byteArray, byteArray.length);

    // initialize some leds
// Initialize effect LEDs
    NS4FX.effectUnit.effects.forEach(function(effect) {
        var button = NS4FX.effectUnit.effectButtons[effect.name];
        if (button && button.trigger) {
            button.trigger();
        }
    });

    NS4FX.decks.forEachComponent(function (component) {
        component.trigger();
    });

    NS4FX.browse = new NS4FX.BrowseKnob();

    // helper functions
    var led = function(group, key, midi_channel, midino) {
        if (engine.getValue(group, key)) {
            midi.sendShortMsg(0x90 | midi_channel, midino, 0x7F);
        }
        else {
            midi.sendShortMsg(0x80 | midi_channel, midino, 0x00);
        }
    };

    // init a bunch of channel specific leds
    for (var i = 0; i < 4; ++i) {
        var group = "[Channel"+(i+1)+"]";

        // keylock indicator
        led(group, 'keylock', i, 0x0D);

        // turn off bpm arrows
        midi.sendShortMsg(0x80 | i, 0x0A, 0x00); // down arrow off
        midi.sendShortMsg(0x80 | i, 0x09, 0x00); // up arrow off

        // slip indicator
        led(group, 'slip_enabled', i, 0x0F);

        // initialize wheel mode (and leds)
        NS4FX.wheel[i] = EnableWheel;
        midi.sendShortMsg(0x90 | i, 0x07, EnableWheel ? 0x7F : 0x01);
    }

    // zero vu meters
    midi.sendShortMsg(0xB0, 0x1F, 0);
    midi.sendShortMsg(0xB1, 0x1F, 0);
    midi.sendShortMsg(0xB2, 0x1F, 0);
    midi.sendShortMsg(0xB3, 0x1F, 0);

    // setup elapsed/remaining tracking
    engine.makeConnection("[Controls]", "ShowDurationRemaining", NS4FX.timeElapsedCallback);

    // setup vumeter tracking
    engine.makeUnbufferedConnection("[Channel1]", "vu_meter", NS4FX.vuCallback);
    engine.makeUnbufferedConnection("[Channel2]", "vu_meter", NS4FX.vuCallback);
    engine.makeUnbufferedConnection("[Channel3]", "vu_meter", NS4FX.vuCallback);
    engine.makeUnbufferedConnection("[Channel4]", "vu_meter", NS4FX.vuCallback);
    engine.makeUnbufferedConnection("[Main]", "vu_meter_left", NS4FX.vuCallback);
    engine.makeUnbufferedConnection("[Main]", "vu_meter_right", NS4FX.vuCallback);
};

NS4FX.shutdown = function() {
    // note: not all of this appears to be strictly necessary, things work fine
    // with out this, but Serato has been observed sending these led reset
    // messages during shutdown. The last sysex message may be necessary to
    // re-enable demo mode.

    // turn off a bunch of channel specific leds
    for (var i = 0; i < 4; ++i) {
        // pfl/cue button leds
        midi.sendShortMsg(0x90 | i, 0x1B, 0x01);

        // loop leds
        midi.sendShortMsg(0x80 | i + 5, 0x32, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x33, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x34, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x35, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x38, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x39, 0x00);

        // play leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x01);
        midi.sendShortMsg(0x90 | i, 0x04, 0x01);

        // sync leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x02);
        midi.sendShortMsg(0x90 | i, 0x04, 0x03);

        // cue leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x01);
        midi.sendShortMsg(0x90 | i, 0x04, 0x05);

        // hotcue leds
        midi.sendShortMsg(0x80 | i + 5, 0x18, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x19, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1A, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1B, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x20, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x21, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x22, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x23, 0x00);

        // auto-loop leds
        midi.sendShortMsg(0x80 | i + 5, 0x14, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x15, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x16, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x17, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1C, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1D, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1E, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1F, 0x00);

        // update spinner and position indicator
        midi.sendShortMsg(0xB0 | i, 0x3F, 0);
        midi.sendShortMsg(0xB0 | i, 0x06, 0);

        // keylock indicator
        midi.sendShortMsg(0x80 | i, 0x0D, 0x00);

        // turn off bpm arrows
        midi.sendShortMsg(0x80 | i, 0x0A, 0x00); // down arrow off
        midi.sendShortMsg(0x80 | i, 0x09, 0x00); // up arrow off

        // turn off slip indicator
        midi.sendShortMsg(0x80 | i, 0x0F, 0x00);

        // turn off wheel button leds
        midi.sendShortMsg(0x80 | i, 0x07, 0x00);
    }

    // dim FX leds
    midi.sendShortMsg(0x98, 0x00, 0x01);
    midi.sendShortMsg(0x98, 0x01, 0x01);
    midi.sendShortMsg(0x98, 0x02, 0x01);
    midi.sendShortMsg(0x99, 0x00, 0x01);
    midi.sendShortMsg(0x99, 0x01, 0x01);
    midi.sendShortMsg(0x99, 0x02, 0x01);

    // turn off sampler leds
    midi.sendShortMsg(0x8F, 0x21, 0x00);
    midi.sendShortMsg(0x8F, 0x22, 0x00);
    midi.sendShortMsg(0x8F, 0x23, 0x00);
    midi.sendShortMsg(0x8F, 0x24, 0x00);

    // zero vu meters
    midi.sendShortMsg(0xBF, 0x44, 0);
    midi.sendShortMsg(0xBF, 0x45, 0);

    // send final shutdown message
    var byteArray = [0xF0, 0x00, 0x20, 0x7F, 0x02, 0xF7];
    midi.sendSysexMsg(byteArray, byteArray.length);
};

NS4FX.EffectUnit = function() {
    var self = this;
    this.deck1 = true;
    this.deck2 = true;
    this.switch_active_left = false;
    this.switch_active_right = false;

    this.toggleEffect = function(effectName) {
        var effect = this.effects.find(e => e.name === effectName);
        if (!effect) return;

        var group = '[EffectRack1_EffectUnit' + effect.unit + '_Effect' + 
                    (this.effects.filter(e => e.unit === effect.unit).indexOf(effect) + 1) + ']';

        // Falls derselbe Effekt gedrückt wird, deaktiviere ihn
        if (this.activeEffect === effectName) {
            engine.setValue(group, 'enabled', 0);
            this.activeEffect = null;
        } else {
            // Deaktiviere alle Effekte
            this.effects.forEach(function(e) {
                var effGroup = '[EffectRack1_EffectUnit' + e.unit + '_Effect' + 
                               (self.effects.filter(x => x.unit === e.unit).indexOf(e) + 1) + ']';
                engine.setValue(effGroup, 'enabled', 0);
            });

            // Aktiviere den neuen Effekt
            engine.setValue(group, 'enabled', 1);
            this.activeEffect = effectName;
        }

        this.updateEffectButtons();
    };

    this.updateEffectButtons = function() {
        var self = this;
        this.effects.forEach(function(effect) {
            var group = '[EffectRack1_EffectUnit' + effect.unit + '_Effect' + 
                        (self.effects.filter(e => e.unit === effect.unit).indexOf(effect) + 1) + ']';
            var isEnabled = engine.getValue(group, 'enabled');
            self.effectButtons[effect.name].output(isEnabled ? 0x7F : 0x00);
        });
    };

    this.dryWetKnob = new components.Pot({
        midi: [0xB8, 0x04],
        group: '[EffectRack1_EffectUnit1]',
        inKey: 'mix',
        input: function(channel, control, value, status, group) {
            var newValue = value / 127;
            engine.setValue('[EffectRack1_EffectUnit1]', 'mix', newValue);
            engine.setValue('[EffectRack1_EffectUnit2]', 'mix', newValue);
        }
    });

    this.effects = [
        {name: 'hpf', status: 0x98, control: 0x00, unit: 1},
        {name: 'lpf', status: 0x98, control: 0x01, unit: 1},
        {name: 'flanger', status: 0x98, control: 0x02, unit: 1},
        {name: 'echo', status: 0x99, control: 0x03, unit: 2},
        {name: 'reverb', status: 0x99, control: 0x04, unit: 2},
        {name: 'phaser', status: 0x99, control: 0x05, unit: 2}
    ];
    this.activeEffect = null;

    this.effectButtons = {};
    this.effects.forEach(function(effect) {
        self.effectButtons[effect.name] = new components.Button({
            midi: [effect.status, effect.control],
            group: '[EffectRack1_EffectUnit' + effect.unit + ']',
            inKey: 'enabled',
            input: function(channel, control, value, status, group) {
                if (value === 0x7F) {
                    self.toggleEffect(effect.name);
                }
            }
        });
    });

    this.setEffectUnitsForChannel = function(channel, active) {
        var unit1 = "[EffectRack1_EffectUnit1]";
        var unit2 = "[EffectRack1_EffectUnit2]";
        var groupKey = "group_[Channel" + channel + "]_enable";

        engine.setValue(unit1, groupKey, active);
        engine.setValue(unit2, groupKey, active);

        if (channel === 1 || channel === 3){
            this.switch_active_left = active;
        } else {
            this.switch_active_right = active;
        }
    };
    
    // Linker Switch (Deck 1)
    this.leftSwitch = function(channel, control, value, status, group) {
        var active = value !== 0x00;
        var inactiveDeck = this.deck1 ? 3 : 1;
        var activeDeck = this.deck1 ? 1 : 3;
        var isActive = deck => (deck === activeDeck) || !OnlyActiveDeckEffect;
    
        this.setEffectUnitsForChannel(inactiveDeck, isActive(inactiveDeck) && active);
        this.setEffectUnitsForChannel(activeDeck, isActive(activeDeck) && active);
    };
    
    this.rightSwitch = function(channel, control, value, status, group) {
        var active = value !== 0x00;
        var inactiveDeck = this.deck2 ? 4 : 2;
        var activeDeck = this.deck2 ? 2 : 4;
        var isActive = deck => (deck === activeDeck) || !OnlyActiveDeckEffect;
    
        this.setEffectUnitsForChannel(inactiveDeck, isActive(inactiveDeck) && active);
        this.setEffectUnitsForChannel(activeDeck, isActive(activeDeck) && active);
    };

    this.updateEffectOnDeckSwitch = function(leftSide){
        if (!OnlyActiveDeckEffect){
            return;
        }

        if (leftSide) {
            var active = this.switch_active_left ? 0x01 : 0x00;
            this.leftSwitch(0, 0, active, 0, 0)
        } else {
            //var func = this.rightSwitch;
            var active = this.switch_active_right ? 0x01 : 0x00;
            this.rightSwitch(0, 0, active, 0, 0);
        }

    }
}

NS4FX.EffectUnit.prototype = new components.ComponentContainer();

NS4FX.Deck = function(number, midi_chan) {
    var deck = this;
    this.active = (number == 1 || number == 2);
    

    hotcuePressed = false;
    playPressedDuringHotcue = false;
    
    components.Deck.call(this, number);


    this.bpm = new components.Component({
        outKey: "bpm",
        output: function(value, group, control) {
            NS4FX.sendScreenBpmMidi(number, Math.round(value * 100));
        },
    });

    this.duration = new components.Component({
        outKey: "duration",
        output: function(duration, group, control) {
            // update duration
            NS4FX.sendScreenDurationMidi(number, duration * 1000);

            // when the duration changes, we need to update the play position
            deck.position.trigger();
        },
    });

    this.position = new components.Component({
        outKey: "playposition",
        output: function(playposition, group, control) {
            // the controller appears to expect a value in the range of 0-52
            // representing the position of the track. Here we send a message to the
            // controller to update the position display with our current position.
            var pos = Math.round(playposition * 52);
            if (pos < 0) {
                pos = 0;
            }
            midi.sendShortMsg(0xB0 | midi_chan, 0x3F, pos);

            // get the current duration
            duration = deck.duration.outGetValue();

            // update the time display
            var time = NS4FX.timeMs(number, playposition, duration);
            NS4FX.sendScreenTimeMidi(number, time);

            // update the spinner (range 64-115, 52 values)
            //
            // the visual spinner in the mixxx interface takes 1.8 seconds to loop
            // (60 seconds/min divided by 33 1/3 revolutions per min)
            var period = 60 / (33+1/3);
            var midiResolution = 52; // the controller expects a value range of 64-115
            var timeElapsed = duration * playposition;
            var spinner = Math.round(timeElapsed % period * (midiResolution / period));
            if (spinner < 0) {
                spinner += 115;
            } else {
                spinner += 64;
            }

            midi.sendShortMsg(0xB0 | midi_chan, 0x06, spinner);
        },
    });

    this.orientation = new components.Button({
        midi: [0xB0 -1 + midi_chan, 0x1E],
        input: function(channel, control, value, status) {
            var desiredOrientation = [1,0,2][value]
            engine.setValue(this.group, "orientation", desiredOrientation);
        },
    });
    

    this.play_button = new components.PlayButton({
        midi: [0x90 + midi_chan, 0x00],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 4,
        unshift: function() {
            components.PlayButton.prototype.unshift.call(this);
            this.type = components.Button.prototype.types.toggle;
        },
        shift: function() {
            this.inKey = 'play_stutter';
            this.type = components.Button.prototype.types.push;
        },
        input: function(channel, control, value, status, group) {
            if (this.isShifted) {
                // Shift-Modus Logik
                if (value === 0x7F) {
                    engine.setValue(group, "play_stutter", 1);
                } else {
                    engine.setValue(group, "play_stutter", 0);
                }
            } else {
                // Normaler Modus Logik
                if (value === 0x7F) {
                    print(hotcuePressed)
                    if (hotcuePressed) {
                        print("pressed during hotcue")
                        playPressedDuringHotcue = true;
                    } else {
                        print("normal")
                        var currentPlayState = engine.getValue(group, "play");
                        engine.setValue(group, "play", !currentPlayState);
                    }
                }
            }
        }
    });

    //HIER
    this.load = new components.Button({
        inKey: 'LoadSelectedTrack',
        shift: function() {
            if (ShiftLoadEjects) {
                this.inKey = 'eject';
            }
            else {
                this.inKey = 'LoadSelectedTrackAndPlay';
            }
        },
        unshift: function() {
            this.inKey = 'LoadSelectedTrack';
        },
    });

    this.cue_button = new components.CueButton({
        midi: [0x90 + midi_chan, 0x01],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 4,
    });

    this.sync_button = new components.SyncButton({
        midi: [0x90 + midi_chan, 0x02],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 1,
    });

    this.pfl_button = new components.Button({
        midi: [0x90 + midi_chan, 0x1B],
        key: 'pfl',
        off: 0x01,
        type: components.Button.prototype.types.toggle,
        connect: function() {
            components.Button.prototype.connect.call(this);
            this.connections[1] = engine.makeConnection(this.group, this.outKey, NS4FX.pflToggle.bind(this));
        },
    });

    this.hotcue_buttons = new components.ComponentContainer();
    this.sampler_buttons = new components.ComponentContainer();
    for (var i = 1; i <= 4; ++i) {
        this.hotcue_buttons[i] = new components.HotcueButton({
            midi: [0x94 + midi_chan, 0x18 + i - 1],
            number: i,
           
            output: function(value) {
                var brightness = value ? 0x7F : 0x01;
                midi.sendShortMsg(this.midi[0], this.midi[1], brightness); // Zweites Byte  
}     
        });

        //cue buttons 5 - 8
        this.hotcue_buttons[9-i] = new components.HotcueButton({
            midi: [0x94 + midi_chan, 0x18 - i],
            number: 9-i,
            input: function(channel, control, value, status, group) {
                var isShifted = (control == (0x18 + this.number - 1));
                if (value === 0x7F) { // Hotcue gedrückt
                    var hotcueExists = engine.getValue(group, "hotcue_" + this.number + "_enabled");
                    if (isShifted && hotcueExists){
                        engine.setValue(group, "hotcue_" + this.number + "_clear", 1);
                    }
                    else if (hotcueExists) {
                        // Wenn Hotcue existiert, gehe zu dieser Position
                        this.oldPosition = engine.getValue(group, "playposition");
                        this.wasPlaying = engine.getValue(group, "play");
                        hotcuePressed = true;
                        playPressedDuringHotcue = false;
                        
                        engine.setValue(group, "hotcue_" + this.number + "_goto", 1);
                        
                        if (!this.wasPlaying) {
                            engine.setValue(group, "play", 1);
                        }
                    } else {
                        // Wenn kein Hotcue existiert, setze einen neuen
                        engine.setValue(group, "hotcue_" + this.number + "_set", 1);
                        print("Hotcue " + this.number + " set");
                    }
                } else if (!isShifted){ // Hotcue losgelassen
                    if (hotcuePressed) {
                        if (!this.wasPlaying && !playPressedDuringHotcue) {
                            engine.setValue(group, "play", 0);
                            engine.setValue(group, "hotcue_" + this.number + "_goto", 1);
                        }
                        hotcuePressed = false;
                    }
                }
            },
            output: function(value) {
                midi.sendShortMsg(this.midi[0], this.midi[1], value ? 0x7F : 0x01);
            },
        
        });
    }
    this.hotcues = this.hotcue_buttons;

    this.pitch = new components.Pot({
        inKey: 'rate',
        invert: true,
    });
    if (!this.active) {
        this.pitch.firstValueReceived = true;
    }

    var pitch_or_keylock = function (channel, control, value, status, group) {
        if (this.other.inGetValue() > 0.0 && this.isPress(channel, control, value, status)) {
            // toggle keylock, both keys pressed
            script.toggleControl(this.group, "keylock");
        }
        else {
            components.Button.prototype.input.call(this, channel, control, value, status, group);
        }
    };
    this.pitch_bend_up = new components.Button({
        inKey: 'rate_temp_up',
        input: pitch_or_keylock,
    });
    this.pitch_bend_down = new components.Button({
        inKey: 'rate_temp_down',
        input: pitch_or_keylock,
    });
    this.pitch_bend_up.other = this.pitch_bend_down;
    this.pitch_bend_down.other = this.pitch_bend_up;

    var key_up_or_down = function (channel, control, value, status, group) {
        this.is_pressed = this.isPress(channel, control, value, status);
        if (this.is_pressed) {
            if (this.other.is_pressed) {
                // reset if both buttons are pressed
                engine.setValue(deck.currentDeck, "pitch_adjust", 0.0);
            }
            else {
                this.inSetValue(1.0);
            }
        }
    };
    this.key_up = new components.Button({
        inKey: 'pitch_up',
        direction: 1,
        input: key_up_or_down,
    });
    this.key_down = new components.Button({
        inKey: 'pitch_down',
        direction: -1,
        input: key_up_or_down,
    });
    this.key_up.other = this.key_down;
    this.key_down.other = this.key_up;

    //LOOP
    this.loopControls = new components.ComponentContainer({
        loop_halve: new components.Button({
            midi: [0x94 + midi_chan, 0x34],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    engine.setValue(this.group, "loop_halve", 1);
                    print("Loop halved");
                    this.output(1);
                } else if (value === 0x00) { // Button released
                    this.output(0);
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            }
        }),
        
        loop_double: new components.Button({
            midi: [0x94 + midi_chan, 0x35],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    engine.setValue(this.group, "loop_double", 1);
                    print("Loop doubled");
                    this.output(1);
                    for (var status = 0xB0; status <= 0xBF; status++) { // MIDI-Kanäle 1-16
                        for (var control = 0x00; control <= 0x7F; control++) { // Steueradressen 0-127
                            if (status == 0xBF && control == 0x75) continue;
                            if (status == 0xBA && control == 0x75) continue;
                            midi.sendShortMsg(status, control, 0); // Maximaler Wert (VU-Meter voll setzen)
                        }
                    }
                } else if (value === 0x00) { // Button released
                    this.output(0);
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            }
        }),
        
        loop_in: new components.Button({
            midi: [0x94 + midi_chan, 0x36],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    engine.setValue(this.group, "loop_in", 1);
                    print("Loop in point set");
                    this.output(1);
                } else if (value === 0x00) { // Button released
                    engine.setValue(this.group, "loop_in", 0);
                    this.output(0);
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            }
        }),
        
        loop_out: new components.Button({
            midi: [0x94 + midi_chan, 0x37],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    engine.setValue(this.group, "loop_out", 1);
                    print("Loop out point set");
                    this.output(1);
                } else if (value === 0x00) { // Button released
                    engine.setValue(this.group, "loop_out", 0);
                    this.output(0);
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            }
        }),
        reloop: new components.Button({
            midi: [0x94 + midi_chan, 0x41],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    var loopEnabled = engine.getValue(this.group, "loop_enabled");
                    if (loopEnabled) {
                        // Wenn der Loop aktiv ist, deaktivieren wir ihn
                        engine.setValue(this.group, "loop_enabled", 0);
                        print("Loop deactivated");
                    } else {
                        // Wenn kein Loop aktiv ist, aktivieren wir den letzten Loop
                        engine.setValue(this.group, "reloop_toggle", 1);
                        print("Reloop activated");
                    }
                    this.output(1);
                } else if (value === 0x00) { // Button released
                    this.output(0);
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            },
            connect: function() {
                this.connections.push(
                    engine.connectControl(this.group, "loop_enabled", function(value) {
                        this.output(value);
                    }.bind(this))
                );
            }
        }),
        
        loop_toggle: new components.Button({
            midi: [0x94 + midi_chan, 0x40],
            input: function(channel, control, value, status) {
                if (value === 0x7F) { // Button pressed
                    var loopEnabled = engine.getValue(this.group, "loop_enabled");
                    var loopStartPosition = engine.getValue(this.group, "loop_start_position");
                    var loopEndPosition = engine.getValue(this.group, "loop_end_position");
                    var currentPosition = engine.getValue(this.group, "playposition");
                    var trackSamples = engine.getValue(this.group, "track_samples");
                    
                    // Konvertiere currentPosition zu Samples
                    var currentSamplePosition = currentPosition * trackSamples;
                    
                    if (loopEnabled) {
                        // Wenn ein Loop aktiv ist, deaktivieren wir ihn
                        engine.setValue(this.group, "loop_enabled", 0);
                    } else if (loopStartPosition >= 0 && loopEndPosition > loopStartPosition &&
                               currentSamplePosition >= loopStartPosition && currentSamplePosition <= loopEndPosition) {
                        // Wenn wir uns innerhalb eines definierten Loops befinden, aktivieren wir ihn
                        engine.setValue(this.group, "loop_enabled", 1);
                    } else {
                        // Ansonsten setzen wir einen neuen Loop
                        engine.setValue(this.group, "beatloop_activate", 1);
                    }
                }
            },
            output: function(value) {
                this.send(value ? 0x7F : 0x01);
            },
            connect: function() {
                this.connections.push(
                    engine.connectControl(this.group, "loop_enabled", function(value) {
                        this.output(value);
                    }.bind(this)),
                    engine.connectControl(this.group, "track_loaded", function() {
                        var loopEnabled = engine.getValue(this.group, "loop_enabled");
                        this.output(loopEnabled);
                    }.bind(this))
                );
            }
        })
        
          
    });


    this.EqEffectKnob = function (group, in_key, fx_key, filter_knob) {
        this.unshift_group = group;
        this.unshift_key = in_key;
        this.fx_key = fx_key;
        if (filter_knob) {
            this.shift_key = 'super1';
        }
        this.ignore_next = null;
        components.Pot.call(this, {
            group: group,
            inKey: in_key,
        });
    };
    this.EqEffectKnob.prototype = new components.Pot({
        input: function (channel, control, value, status, group) {
            // if the control group and key has changed, ignore_next will hold
            // the old settings. We need to tell the soft takeover engine to
            // ignore the next values for that control so that when we
            // eventually switch back to it, soft takeover will manage it
            // properly.
            //
            // We call IgnoreNextValue() here instead of in shift()/unshift()
            // (via connect()/disconnect()) because if we did that, pressing
            // the shift key would cause the next value on the control to be
            // ignored even if the control wasn't moved, which would trigger
            // a phantom soft takeover if the control was moved fast enough. We
            // only need to IgnoreNextValue() if the control has actually moved
            // after switching the target group/key.
            if (this.ignore_next) {
                engine.softTakeoverIgnoreNextValue(this.ignore_next.group, this.ignore_next.key);
                this.ignore_next = null;
            }
            components.Pot.prototype.input.call(this, channel, control, value, status, group);
        },
        connect: function() {
            // enable soft takeover on our controls
            for (var i = 1; i <= 3; i++) {
                var group = '[EffectRack1_EffectUnit1_Effect' + i + ']';
                engine.softTakeover(group, this.fx_key, true);
            }
            components.Pot.prototype.connect.call(this);
        },        
        shift: function() {
            var focused_effect = engine.getValue('[EffectRack1_EffectUnit1]', "focused_effect");
            if (focused_effect === 0) {
                if (this.shift_key) {
                    engine.softTakeover('[EffectRack1_EffectUnit1]', this.shift_key, true);
                    this.switchControl('[EffectRack1_EffectUnit1]', this.shift_key);
                }
            } else {
                var group = '[EffectRack1_EffectUnit1_Effect' + focused_effect + ']';
                this.switchControl(group, this.fx_key);
            }
        },
        
        unshift: function() {
            this.switchControl(this.unshift_group, this.unshift_key);
        },
        switchControl: function(group, key) {
            if (this.group != group || this.inKey != key) {
                this.ignore_next = { 'group': this.group, 'key': this.inKey };
            }
            this.group = group;
            this.inKey = key;
        },
    });

    var eq_group = '[EqualizerRack1_' + this.currentDeck + '_Effect1]';
    this.high_eq = new this.EqEffectKnob(eq_group, 'parameter3', 'parameter3');
    this.mid_eq = new this.EqEffectKnob(eq_group, 'parameter2', 'parameter4');
    this.low_eq = new this.EqEffectKnob(eq_group, 'parameter1', 'parameter5');

    this.filter = new this.EqEffectKnob(
    '[QuickEffectRack1_' + this.currentDeck + ']',
    'super1',
    'parameter1',
    true);

    this.gain = new this.EqEffectKnob(
    this.currentDeck,
    'pregain',
    'parameter2');


    this.reconnectComponents(function (c) {
        if (c.group === undefined) {
            c.group = deck.currentDeck;
        }
    });

    // don't light up sampler buttons in hotcue mode
    this.sampler_buttons.forEachComponent(function(component) {
        component.disconnect();
    });

    this.setActive = function(active) {
        this.active = active;

        if (!active) {
            // trigger soft takeover on the pitch control
            this.pitch.disconnect();
        }
    };
};

NS4FX.Deck.prototype = new components.Deck();

NS4FX.Sampler = function(base) {
    for (var i = 1; i <= 4; ++i) {
        this[i] = new components.SamplerButton({
            midi: [0x9F, 0x20 + i],
            number: base+i-1,
            loaded: 0x00,
            playing: 0x7F,
        });
    }
};

NS4FX.Sampler.prototype = new components.ComponentContainer();

NS4FX.HeadGain = function(sampler) {
    components.Pot.call(this);

    this.ignore_next = null;
    this.shifted = false;
    this.sampler = sampler;
    this.sampler.forEachComponent(function(component) {
        engine.softTakeover(component.group, 'volume', true);
    });
};
NS4FX.HeadGain.prototype = new components.Pot({
    group: '[Master]',
    inKey: 'headGain',
    input: function (channel, control, value, status, group) {
        // we call softTakeoverIgnoreNextValue() here on the non-targeted
        // control only if the control was moved when focus was switched. This
        // is to avoid a phantom triggering of soft takeover that can happen if
        // ignoreNextValue() is called un-conditionally when the control target
        // is changed (like in shift()/unshift()).
        if (this.ignore_next == "sampler" && !this.shifted) {
            this.sampler.forEachComponent(function(component) {
                engine.softTakeoverIgnoreNextValue(component.group, 'volume');
            });
            this.ignore_next = null;
        }
        else if (this.ignore_next == "headgain" && this.shifted) {
            engine.softTakeoverIgnoreNextValue(this.group, this.inKey);
            this.ignore_next = null;
        }

        if (this.shifted) {
            // make head gain control the sampler volume when shifted
            var pot = this;
            this.sampler.forEachComponent(function(component) {
                engine.setParameter(component.group, 'volume', pot.inValueScale(value));
            });
        } else {
            components.Pot.prototype.input.call(this, channel, control, value, status, group);
        }
    },
    shift: function() {
        this.shifted = true;
        this.ignore_next = "headgain";
    },
    unshift: function() {
        this.shifted = false;
        this.ignore_next = "sampler";
    },
});

NS4FX.BrowseKnob = function() {
    this.knob = new components.Encoder({
        group: '[Library]',
        input: function (channel, control, value, status, group) {
            if (value === 1) {
                engine.setParameter(this.group, this.inKey + 'Down', 1);
            } else if (value === 127) {
                engine.setParameter(this.group, this.inKey + 'Up', 1);
            }
        },
        unshift: function() {
            this.inKey = 'Move';
        },
        shift: function() {
            this.inKey = 'Scroll';
        },
    });

    this.button = new components.Button({
        group: '[Library]',
        inKey: 'GoToItem',
        unshift: function() {
            this.inKey = 'GoToItem';
        },
        shift: function() {
            this.inKey = 'MoveFocusForward';
        },
    });
};

NS4FX.BrowseKnob.prototype = new components.ComponentContainer();

NS4FX.encodeNumToArray = function(number) {
    var number_array = [
        (number >> 28) & 0x0F,
        (number >> 24) & 0x0F,
        (number >> 20) & 0x0F,
        (number >> 16) & 0x0F,
        (number >> 12) & 0x0F,
        (number >> 8) & 0x0F,
        (number >> 4) & 0x0F,
        number & 0x0F,
    ];

    if (number < 0) number_array[0] = 0x07;
    else number_array[0] = 0x08;

    return number_array;
};

NS4FX.sendScreenDurationMidi = function(deck, duration) {
    if (duration < 1) {
        duration = 1;
    }
    durationArray = NS4FX.encodeNumToArray(duration - 1);

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x03];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(durationArray, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

NS4FX.sendScreenTimeMidi = function(deck, time) {
    var timeArray = NS4FX.encodeNumToArray(time);

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x04];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(timeArray, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

NS4FX.sendScreenBpmMidi = function(deck, bpm) {
    bpmArray = NS4FX.encodeNumToArray(bpm);
    bpmArray.shift();
    bpmArray.shift();

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x01];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(bpmArray, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

NS4FX.elapsedToggle = function (channel, control, value, status, group) {
    if (value != 0x7F) return;

    var current_setting = engine.getValue('[Controls]', 'ShowDurationRemaining');
    if (current_setting === 0) {
        // currently showing elapsed, set to remaining
        engine.setValue('[Controls]', 'ShowDurationRemaining', 1);
    } else if (current_setting === 1) {
        // currently showing remaining, set to elapsed
        engine.setValue('[Controls]', 'ShowDurationRemaining', 0);
    } else {
        // currently showing both (that means we are showing remaining, set to elapsed
        engine.setValue('[Controls]', 'ShowDurationRemaining', 0);
    }
};

NS4FX.timeElapsedCallback = function(value, group, control) {
    // 0 = elapsed
    // 1 = remaining
    // 2 = both (we ignore this as the controller can't show both)
    var on_off;
    if (value === 0) {
        // show elapsed
        on_off = 0x00;
    } else if (value === 1) {
        // show remaining
        on_off = 0x7F;
    } else {
        // both, ignore the event
        return;
    }

    // update all 4 decks on the controller
    midi.sendShortMsg(0x90, 0x46, on_off);
    midi.sendShortMsg(0x91, 0x46, on_off);
    midi.sendShortMsg(0x92, 0x46, on_off);
    midi.sendShortMsg(0x93, 0x46, on_off);
};

NS4FX.timeMs = function(deck, position, duration) {
    return Math.round(duration * position * 1000);
};

// these functions track if the user has let go of the jog wheel but it is
// still spinning
NS4FX.scratch_timer = []; // initialized before use (null is an acceptable value)
NS4FX.scratch_tick = [];  // initialized before use
NS4FX.resetScratchTimer = function (deck, tick) {
    if (!NS4FX.scratch_timer[deck]) return;
    NS4FX.scratch_tick[deck] = tick;
};

NS4FX.startScratchTimer = function (deck) {
    if (NS4FX.scratch_timer[deck]) return;

    NS4FX.scratch_tick[deck] = 0;
    NS4FX.scratch_timer[deck] = engine.beginTimer(20, () => {
        NS4FX.scratchTimerCallback(deck);
    });
};

NS4FX.stopScratchTimer = function (deck) {
    if (NS4FX.scratch_timer[deck]) {
        engine.stopTimer(NS4FX.scratch_timer[deck]);
    }
    NS4FX.scratch_timer[deck] = null;
};

NS4FX.scratchTimerCallback = function (deck) {
    // here we see if the platter is still physically moving even though the
    // platter is not being touched. For forward motion, we stop scratching
    // before the platter has physically stopped  and delay a little longer
    // when moving back. This is to mimic actual vinyl better.
    if ((NS4FX.scratch_direction[deck] // forward
            && Math.abs(NS4FX.scratch_tick[deck]) > 2)
        || (!NS4FX.scratch_direction[deck] // backward
            && Math.abs(NS4FX.scratch_tick[deck]) > 1))
    {
        // reset tick detection
        NS4FX.scratch_tick[deck] = 0;
        return;
    }

    NS4FX.scratchDisable(deck);
};

NS4FX.scratchDisable = function (deck) {
    NS4FX.searching[deck] = false;
    NS4FX.stopScratchTimer(deck);
    engine.scratchDisable(deck, false);
};

NS4FX.scratchEnable = function (deck) {
    var alpha = 1.0/8;
    var beta = alpha/32;

    engine.scratchEnable(deck, 1240, 33+1/3, alpha, beta);
    NS4FX.stopScratchTimer(deck);
};

// The button that enables/disables scratching
// these arrays are indexed from 1, so we initialize them with 5 values
NS4FX.touching = [false, false, false, false, false];
NS4FX.searching = [false, false, false, false, false];
NS4FX.wheelTouch = function (channel, control, value, status, group) {
    var deck = channel + 1;

    // ignore touch events if not in vinyl mode
    if (!NS4FX.shift
        && !NS4FX.searching[deck]
        && !NS4FX.wheel[channel]
        && value != 0)
    {
        return;
    }

    NS4FX.touching[deck] = 0x7F == value;


    // don't start scratching if shift is pressed
    if (value === 0x7F
        && !NS4FX.shift
        && !NS4FX.searching[deck])
    {
        NS4FX.scratchEnable(deck);
    }
    else if (value === 0x7F
             && (NS4FX.shift
                || NS4FX.searching[deck]))
    {
        NS4FX.scratchDisable(deck);
        NS4FX.searching[deck] = true;
        NS4FX.stopScratchTimer(deck);
    }
    else {    // If button up
        NS4FX.startScratchTimer(deck);
    }
};

// The wheel that actually controls the scratching
// indexed by deck numbers starting at 1, so include an extra element
NS4FX.scratch_direction = [null, null, null, null, null]; // true == forward
NS4FX.scratch_accumulator = [0, 0, 0, 0, 0];
NS4FX.last_scratch_tick = [0, 0, 0, 0, 0];
NS4FX.wheelTurn = function (channel, control, value, status, group) {
    var deck = channel + 1;
    var direction;
    var newValue;
    if (value < 64) {
        direction = true;
    } else {
        direction = false;
    }

    // if the platter is spun fast enough, value will wrap past the 64 midpoint
    // but the platter will be spinning in the opposite direction we expect it
    // to be
    var delta = Math.abs(NS4FX.last_scratch_tick[deck] - value);
    if (NS4FX.scratch_direction[deck] !== null && NS4FX.scratch_direction[deck] != direction && delta < 64) {
        direction = !direction;
    }

    if (direction) {
        newValue = value;
    } else {
        newValue = value - 128;
    }

    // detect searching the track
    if (NS4FX.searching[deck]) {
        var position = engine.getValue(group, 'playposition');
        if (position <= 0) position = 0;
        if (position >= 1) position = 1;
        engine.setValue(group, 'playposition', position + newValue * 0.0001);
        NS4FX.resetScratchTimer(deck, newValue);
        return;
    }

    // stop scratching if the wheel direction changes and the platter is not
    // being touched
    if (NS4FX.scratch_direction[deck] === null) {
        NS4FX.scratch_direction[deck] = direction;
    }
    else if (NS4FX.scratch_direction[deck] != direction) {
        if (!NS4FX.touching[deck]) {
            NS4FX.scratchDisable(deck);
        }
        NS4FX.scratch_accumulator[deck] = 0;
    }

    NS4FX.last_scratch_tick[deck] = value;
    NS4FX.scratch_direction[deck] = direction;
    NS4FX.scratch_accumulator[deck] += Math.abs(newValue);

    // handle scratching
    if (engine.isScratching(deck)) {
        engine.scratchTick(deck, newValue); // Scratch!
        NS4FX.resetScratchTimer(deck, newValue);
    }
    // handle beat jumping
    else if (NS4FX.shift) {
        if (NS4FX.scratch_accumulator[deck] > 61) {
            NS4FX.scratch_accumulator[deck] -= 61;
            if (direction) { // forward
                engine.setParameter(group, 'beatjump_1_forward', 1);
            } else {
                engine.setParameter(group, 'beatjump_1_backward', 1);
            }
        }
    }
    // handle pitch bending
    else {
        engine.setValue(group, 'jog', newValue * 0.1); // Pitch bend
    }
};

NS4FX.wheel = []; // initialized in the NS4FX.init() function
NS4FX.wheelToggle = function (channel, control, value, status, group) {
    if (value != 0x7F) return;
    NS4FX.wheel[channel] = !NS4FX.wheel[channel];
    var on_off = 0x01;
    if (NS4FX.wheel[channel]) on_off = 0x7F;
    midi.sendShortMsg(0x90 | channel, 0x07, on_off);
};

NS4FX.deckSwitch = function (channel, control, value, status, group) {
    this.ignore_deck_switch = !this.ignore_deck_switch;

    if (!this.ignore_deck_switch){
        return;
    }

    var deck = channel + 1;
    NS4FX.decks[deck].setActive(value == 0x7F);

    // change effects racks
    if (NS4FX.decks[deck].active && (channel == 0x00 || channel == 0x02)) {
        NS4FX.effectUnit.deck1 = (deck == 1);
        var left_side = true;
    }
    else if (NS4FX.decks[deck].active && (channel == 0x01 || channel == 0x03)) {
        NS4FX.effectUnit.deck2 = (deck == 2);
        var left_side = false;
    }
    NS4FX.effectUnit.updateEffectOnDeckSwitch(left_side);

    // also zero vu meters if vu displays individual decks
    if (value == 0x7F && !displayVUFromBothDecks){
    midi.sendShortMsg(0xB0, 0x1F, 0);
    midi.sendShortMsg(0xB1, 0x1F, 0);
    midi.sendShortMsg(0xB2, 0x1F, 0);
    midi.sendShortMsg(0xB3, 0x1F, 0);
    }
};

// zero vu meters when toggling pfl
NS4FX.pflToggle = function(value, group, control) {
    midi.sendShortMsg(0xB0, 0x1F, 0);
    midi.sendShortMsg(0xB1, 0x1F, 0);
    midi.sendShortMsg(0xB2, 0x1F, 0);
    midi.sendShortMsg(0xB3, 0x1F, 0);
};

NS4FX.vuCallback = function(value, group, control) {
    // the top LED lights up at 81
    var level =value * 81;
    if (engine.getValue(group, "peak_indicator")) {
        level = 81;
    }
    if (displayVUFromBothDecks){
        if (group == '[Main]' && control == 'vu_meter_left') {
            if (engine.getValue(group, "peak_indicator_left")) {
                level = 81;
            }
            midi.sendShortMsg(0xB0, 0x1F, level);
            midi.sendShortMsg(0xB2, 0x1F, level);
           }
           else if (group == '[Main]' && control == 'vu_meter_right') {
               if (engine.getValue(group, "peak_indicator_right")) {
                   level = 81;
                   midi.sendShortMsg(0xB1, 0x1F, level);
                   midi.sendShortMsg(0xB3, 0x1F, level);
               }
            
        }
    }else{
        if (group == '[Channel1]' && NS4FX.decks[1].active) {
            midi.sendShortMsg(0xB0, 0x1F, level);
        }
        else if (group == '[Channel3]' && NS4FX.decks[3].active) {
            midi.sendShortMsg(0xB2, 0x1F, level);
        }
        else if (group == '[Channel2]' && NS4FX.decks[2].active) {
            midi.sendShortMsg(0xB1, 0x1F, level);
        }
        else if (group == '[Channel4]' && NS4FX.decks[4].active) {
            midi.sendShortMsg(0xB3, 0x1F, level);
        }
    }

 };

// track the state of the shift key
NS4FX.shift = false;
NS4FX.shiftToggle = function (channel, control, value, status, group) {
    if (control === 0x20) {
        NS4FX.shift = value == 0x7F;
    }
    
    if (NS4FX.shift) {
        NS4FX.decks.shift();
        NS4FX.sampler_all.shift();
        NS4FX.browse.shift();
        NS4FX.head_gain.shift();

        // reset the beat jump scratch accumulators
        NS4FX.scratch_accumulator[1] = 0;
        NS4FX.scratch_accumulator[2] = 0;
        NS4FX.scratch_accumulator[3] = 0;
        NS4FX.scratch_accumulator[4] = 0;
    }
    else {
        NS4FX.decks.unshift();
        NS4FX.sampler_all.unshift();
        NS4FX.browse.unshift();
        NS4FX.head_gain.unshift();
    }
};

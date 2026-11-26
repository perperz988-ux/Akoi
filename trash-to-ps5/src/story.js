// Story data + mission engine for TRASH TO PS5.
import { PLACES } from './world.js';

export const ITEMS = {
  soda: { name: 'Crushed Soda Can', icon: '🥫', value: 1, desc: 'Sticky. Smells like 2016.' },
  banana: { name: 'Banana Peel', icon: '🍌', value: 0, desc: 'A classic. Do not step on it.' },
  sock: { name: 'Single Sock', icon: '🧦', value: 0, desc: 'Its partner is still out there. Somewhere.' },
  brokenpad: { name: 'Broken Controller', icon: '🕹️', value: 5, desc: 'Drift on every stick. Even the buttons drift.' },
  vhs: { name: 'VHS Tape', icon: '📼', value: 3, desc: '"Grandma\'s 70th — DO NOT TAPE OVER". Taped over.' },
  duck: { name: 'Rubber Duck', icon: '🦆', value: 2, desc: 'Has seen things.' },
  oldphone: { name: 'Ancient Phone', icon: '📱', value: 8, desc: 'Snake high score: 9,999. Respect.' },
  copper: { name: 'Copper Wire', icon: '🧶', value: 4, desc: 'Rosa wants these for her robot.' },
  plug: { name: 'Spark Plug', icon: '🔩', value: 3, desc: 'Sparks joy (and fuel).' },
  battery: { name: 'Batteries', icon: '🔋', value: 2, desc: '40% charged. Probably.' },
  spoon: { name: 'Bent Spoon', icon: '🥄', value: 1, desc: 'Someone tried mind powers.' },
  toaster: { name: 'Toaster', icon: '🍞', value: 6, desc: 'It\'s white and boxy. For one second you got excited.' },
  croc: { name: 'A Single Croc', icon: '🩴', value: 1, desc: 'Sport mode engaged.' },
  pizza: { name: 'Mystery Pizza Slice', icon: '🍕', value: 0, desc: 'Found in garbage. Restores 0 HP and 100% regret.', use: 'eat' },
  cassette: { name: 'Mixtape', icon: '📀', value: 2, desc: '"SUMMER VIBEZ 2003". Fire, allegedly.' },
  keyboard: { name: 'Keyboard (no Q)', icon: '⌨️', value: 4, desc: 'ueue.' },
  // story / special
  receipt: { name: 'Torn Receipt', icon: '🧾', value: 0, story: true, desc: '1x PS5 CONSOLE — paid by M. DELGADO. Who throws THAT away??' },
  key: { name: 'Rusty Key', icon: '🗝️', value: 0, story: true, desc: 'Tag says "LOCKED YARD — GUS". Smells like car seat.' },
  fuse: { name: '30A Fuse', icon: '🔌', value: 0, story: true, desc: 'Fresh from Rosa. Powers old security systems and dreams.' },
  flashlight: { name: 'Flashlight', icon: '🔦', value: 0, story: true, desc: 'Press F (or 🔦) to toggle. Darkness: defeated.' },
  note: { name: '"Nice Try" Note', icon: '📝', value: 0, story: true, desc: '"NICE TRY. —G.  P.S. the code isn\'t the time."' },
  gold: { name: 'GOLDEN CONTROLLER', icon: '🏆', value: 0, story: true, desc: 'It hums. It glows. It has zero stick drift. LEGENDARY.' },
  energy: { name: 'BRO ENERGY Drink', icon: '🥤', value: 0, desc: 'Sprint faster for 60 seconds. Tastes like a battery.', use: 'drink' },
};
export const JUNK_TABLE = [['soda', 18], ['banana', 10], ['sock', 9], ['brokenpad', 4], ['vhs', 6], ['duck', 5], ['oldphone', 3], ['copper', 7], ['plug', 6], ['battery', 7], ['spoon', 6], ['toaster', 3], ['croc', 5], ['pizza', 4], ['cassette', 5], ['keyboard', 3], [null, 10]];

export const CONTACTS = {
  milo: { name: 'Milo 🎮', short: 'Milo', avatar: '😎', color: '#3a86ff', num: '555-0142', bio: 'Best friend. Has been "almost buying a PS5" for 3 years.' },
  mom: { name: 'Mom ❤️', short: 'Mom', avatar: '👩', color: '#ff006e', num: '555-0100', bio: 'Thinks the junkyard is "a germ museum".' },
  unknown: { name: 'UNKNOWN NUMBER', short: 'Unknown', avatar: '❔', color: '#8d99ae', num: '???-????', bio: 'Who even is this.' },
  gus: { name: 'Old Gus', short: 'Gus', avatar: '👴', color: '#e9c46a', num: '555-0199', bio: 'Junkyard worker. 41 years. Suspiciously good reflexes.' },
  rosa: { name: 'Rosa (Mechanic)', short: 'Rosa', avatar: '🔧', color: '#f4a261', num: '555-0177', bio: 'Can fix anything. Currently building a robot. Do not ask.' },
  earl: { name: 'Earl (Security)', short: 'Earl', avatar: '💤', color: '#2a9d8f', num: '555-0123', bio: 'Night guard. Day sleeper. Also night sleeper.' },
  sam: { name: 'Scrapper Sam', short: 'Sam', avatar: '🧢', color: '#8ac926', num: '555-0666', bio: 'Buys junk. Sells "rare" junk. Same junk.' },
};

export const SPEAKERS = { me: 'You', gus: 'Old Gus', rosa: 'Rosa', earl: 'Earl', sam: 'Scrapper Sam', milo: 'Milo', stranger: '???', tyler: 'Tyler', dev: 'Dev (Cashier)', bolt: 'BOLT-9000', mom: 'Mom' };

// ---------------- dialogues ----------------
// node: {s, t, c:[{t, go, fx, if}], go, id, fx, end}
export const DIALOGUES = {
  gus_gate: (G) => [
    { s: 'gus', t: "Whoa whoa whoa. Where you think you're goin', kid?" },
    { s: 'me', t: 'Into the junkyard. Important business.' },
    { s: 'gus', t: "Important business. In MY junkyard. At {time}. What kind of business?", c: [
      { t: '"I\'m looking for a PS5."', go: 'ps5' },
      { t: '"Uh… recycling. I love the planet."', go: 'planet' },
    ] },
    { id: 'ps5', s: 'gus', t: "...A PS5? Here? Hah! HAH. No. Nope. Nobody throws away a PS5. Ridiculous.", go: 'sweat' },
    { id: 'planet', s: 'gus', t: "The planet thanks you. The planet also has a $0 entry fee, so fine.", go: 'in' },
    { id: 'sweat', s: 'gus', t: "*wipes forehead* It's hot today, ain't it? Very normal amount of sweat." },
    { id: 'in', s: 'gus', t: "Fine. Go on in. Don't touch the foxes. Don't lick anything. And the Locked Yard is LOCKED. That's why it's called that.", fx: (G) => { G.flags.gateOpen = true; G.world.setGate('junk', true); G.sfx('gate'); G.nav.rebuild(); } },
  ],
  gus_box: (G) => [
    { s: 'me', t: 'Gus! I found this receipt. Someone threw away a PS5. Have you seen anything?' },
    { s: 'gus', t: "Receipt? Lemme see… M. Delgado. Never heard of 'em. Very not suspicious." },
    { s: 'gus', t: "But… now that you mention it. I DID see somebody. Night before last. Carryin' a big white box." },
    { s: 'me', t: 'WHO?!' },
    { s: 'gus', t: "Tall fella. Handsome. Great posture. Real strong forearms. Walked into the Locked Yard like he owned the place.", c: [
      { t: '"…Was it you?"', go: 'you' },
      { t: '"Which way did he go?"', go: 'way' },
    ] },
    { id: 'you', s: 'gus', t: "WHAT? No. Ha. Ha ha. No. I have average posture. Anyway—", go: 'way' },
    { id: 'way', s: 'gus', t: "Problem is, the Locked Yard's locked, and I lost the key. Took a nap in one of the old cars in the Car Graveyard… woke up, no key." },
    { s: 'gus', t: "If you find it, you can have a look. Here's my number. Don't text me memes. I don't get 'em.", fx: (G) => { G.addContact('gus'); G.discover('cars'); } },
  ],
  earl_cam: (G) => [
    { s: 'earl', t: G.hour >= 8 && G.hour < 20 ? "ZZZ… zzz… huh?! I'M AWAKE. I was… guarding. With my eyes closed. Advanced technique." : "Halt! Who goes there? Oh. A kid. At night. In a junkyard. Totally normal." },
    { s: 'me', t: 'Do the security cameras work? I need to see who walked in here two nights ago.' },
    { s: 'earl', t: "The cameras? Kid, those cameras haven't worked since the Great Fuse Incident of 2019." },
    { s: 'earl', t: "The generator behind this shack needs a 30-amp fuse. Rosa down at the garage in the Front Lot might have one. She has everything. It's honestly concerning." },
    { s: 'earl', t: "Put the fuse in the generator, then watch the tapes on my monitor. I'll be… guarding. *closes eyes*", fx: (G) => G.addContact('earl') },
  ],
  rosa_fuse: (G) => [
    { s: 'rosa', t: "Hey, careful! BOLT-9000 is calibrating. That's my robot. Say hi, BOLT." },
    { s: 'bolt', t: 'BEEP. HELLO. I AM 40% ROBOT AND 60% SHOPPING CART.' },
    { s: 'me', t: 'Hi… Do you have a 30-amp fuse? For the security generator.' },
    { s: 'rosa', t: "A 30-amp? Sure. But nothing's free in the junkyard, kid. BOLT needs new wiring." },
    { s: 'rosa', t: "Bring me 3 COPPER WIRES from the garbage piles and the fuse is yours. Deal?", c: [{ t: '"Deal."', go: 'deal' }, { t: '"Can BOLT dig for them?"', go: 'bolt' }] },
    { id: 'bolt', s: 'bolt', t: 'NEGATIVE. LAST TIME I DUG I FOUND A RACCOON. WE ARE ENEMIES NOW.', go: 'deal' },
    { id: 'deal', s: 'rosa', t: "Copper's usually tangled up in the bigger piles. Here's my number if you get lost.", fx: (G) => { G.addContact('rosa'); G.flags.copperBoost = true; } },
  ],
  rosa_give: (G) => [
    { s: 'me', t: 'Three copper wires, fresh from the trash.' },
    { s: 'rosa', t: "Ooh, the good stuff! BOLT, eat up. …Not literally." },
    { s: 'bolt', t: 'CRUNCH. DELICIOUS. ERROR. JUST KIDDING.' },
    { s: 'rosa', t: "Here's your 30-amp fuse. Generator's right behind the security shack. Don't lick it.", fx: (G) => { G.take('copper', 3); G.give('fuse'); G.flags.helpedRosa = true; } },
  ],
  rosa_idle: (G) => [{ s: 'rosa', t: G.pick(["If it's broken, I can fix it. If it's not broken, I can still 'fix' it.", "BOLT says you have 'main character energy'. I don't know what that means.", "Gus has been weird lately. Keeps humming racing game music.", "You found that PS5 yet? Bring it here, I'll put a turbo in it."]) }],
  sam_trade: (G) => [
    { s: 'sam', t: G.pick(["Heyyy, my favorite customer! What're we sellin' today?", "Psst. You got junk? I LOVE junk. I'm literally named Scrapper.", "Welcome to Sam's! Where your trash becomes slightly less trash."]) },
    { s: 'sam', t: 'Whaddya need?', c: [
      { t: '💰 Sell all my junk', fx: (G) => G.sellJunk('sam'), go: 'sold' },
      { t: '🔦 Buy a flashlight ($30)', if: (G) => !G.has('flashlight'), fx: (G) => G.buy('flashlight', 30), go: 'bye' },
      { t: '🥤 Buy BRO ENERGY ($5)', fx: (G) => G.buy('energy', 5), go: 'bye' },
      { t: '❓ Any rumors?', go: 'rumor' },
      { t: 'Nothing, bye.', go: 'bye' },
    ] },
    { id: 'sold', s: 'sam', t: 'Pleasure doin\' business! I\'ll sell those back to you next week for triple.', end: true },
    { id: 'rumor', s: 'sam', t: G.pick(["Word is there's a trapdoor in one of the old trailers. Smells like gold. Gold smells like pennies, right?", "There's 8 super rare things in this junkyard. Scan 'em all and you're basically a junk god.", "Gus feeds the foxes every night. Bandit's his favorite. That fox is smarter than me.", "I heard Gus has a secret room. And by 'heard' I mean I heard beeping. Video-game beeping."]), end: true },
    { id: 'bye', s: 'sam', t: 'Stay crusty! 🧢' },
  ],
  dev_shop: (G) => [
    { s: 'dev', t: 'Welcome to Quik Stop. We have snacks, drinks, and zero PS5s. Next question.' },
    { s: 'dev', t: 'Buying something?', c: [
      { t: '🔦 Flashlight ($25)', if: (G) => !G.has('flashlight'), fx: (G) => G.buy('flashlight', 25), go: 'ty' },
      { t: '🥤 BRO ENERGY ($4)', fx: (G) => G.buy('energy', 4), go: 'ty' },
      { t: '🍕 Pizza slice ($3)', fx: (G) => G.buy('pizza', 3), go: 'ty' },
      { t: 'Just looking.', go: 'look' },
    ] },
    { id: 'ty', s: 'dev', t: 'Thank you for shopping at Quik Stop. Please leave.', end: true },
    { id: 'look', s: 'dev', t: 'Looking is free. For now.' },
  ],
  pawn_shop: (G) => [
    { s: 'dev', t: '*Pawn & Pay* — "We buy anything. ANYTHING. (Except PS4s disguised as toasters.)"' },
    { s: 'me', t: '…', c: [{ t: '💰 Sell all junk', fx: (G) => G.sellJunk('pawn'), end: true }, { t: 'Leave', go: 'x' }] },
    { id: 'x', s: 'me', t: 'Maybe later.' },
  ],
  milo_city: (G) => [{ s: 'milo', t: G.pick(["BRO. Why are you HERE? The PS5 is THERE. *points at junkyard*", "I'd help but I'm allergic to garbage. And walking.", "Bro if you find it I call player 2. No backsies.", "I've been training my thumbs for this day. Look. *wiggles thumbs*"]) }],
  stranger: (G) => {
    const m = G.story.m; G.flags.strangerTalks = (G.flags.strangerTalks || 0) + (G.flags['st' + m] ? 0 : 1); G.flags['st' + m] = 1;
    const lines = [
      "…You got my message. Good. Don't tell anyone I'm here. I'm technically banned from that junkyard.",
      "The old man sees everything. Ask him about the box. Watch his eyebrows when he answers.",
      "Cars sleep in the graveyard. One of them is holding something that isn't hers.",
      "Cameras never lie. Old cameras just… take a while to wake up.",
      "Follow the mess. Boot prints. Snacks. Paint. Whoever took it is a slob.",
      "A box is just a box. Unless it's a fox in a box.",
      "Where foxes go, people follow. Bring a light.",
      "You're close. Closer than me. I can't go in there. Long story. Involves a forklift.",
      "The code isn't the time. Think backwards.",
      "…",
    ];
    return [{ s: 'stranger', t: lines[Math.min(m, lines.length - 1)] }, { s: 'stranger', t: G.pick(['*disappears into hoodie*', 'Don\'t follow me.', 'Stay frosty.', '*sips juice box mysteriously*']) }];
  },
  gus_idle: (G) => [{ s: 'gus', t: G.hour < 8 || G.hour >= 22 ? "ZZZ… mmh… new lap record… zzz… WHAT. I'm awake." : G.pick(["41 years in this junkyard. Found a lot of things. Never a PS5. Nope.", "Don't feed the foxes. That's my job.", "You ever play racing games? No reason. I don't. I'm old.", "Back in my day, consoles had ONE button. And we liked it."]) }],
  earl_idle: (G) => [{ s: 'earl', t: G.pick(["Zzz… *snore* … guarding…", "Nothing gets past me. Except most things.", "I'm not asleep, I'm in power-save mode."]) }],
  bolt: (G) => [{ s: 'bolt', t: G.pick(['BEEP BOOP. I HAVE BEEN TOLD TO SAY BEEP BOOP.', 'SCANNING… YOU ARE 0% PS5.', 'I DREAM OF ELECTRIC FOXES.']) }],
  diary: (G) => [
    { s: 'me', t: "A diary. 'PROPERTY OF GUS. DO NOT READ.' …Reading it." },
    { s: 'gus', t: "Day 1: Delgado lady drove up at 2:14 AM and THREW A PS5 into my junkyard. Yelled something about 'math grades'. I caught it mid-air. Still got it." },
    { s: 'gus', t: "Day 2: Built a decoy box in the Container Maze. Bandit helped. Bandit is a good fox." },
    { s: 'gus', t: "Day 3: Put it in the vault. Code is the time I found it… BACKWARDS. For security. I am a genius." },
    { s: 'me', t: "2:14 AM… backwards… so the code is 4-1-2-0.", fx: (G) => G.note('code', 'Vault Code', 'Gus found the PS5 at 02:14. The vault code is the time BACKWARDS → 4120.') },
  ],
};

// phone calls (hint system)
export function callLine(G, id) {
  const m = G.story.m, hints = [
    'Check your messages first, bro!', 'Go to the junkyard, north of town. Just follow the road.', 'Search garbage piles in the Front Lot. Look at a pile and hold E.',
    "Ask that old worker guy, Gus. He's always wandering around the Front Lot.", 'Gus lost his key in the Car Graveyard. Use your phone Scanner near the cars!',
    'Security cameras need power. Talk to the guard, then the mechanic. Copper wire is in the garbage.', 'Use your phone Camera on the clues in the Container Maze. Boot prints, snacks, spray paint.',
    'The box! Dig it out! And if something runs… CHASE IT.', 'You need a flashlight for tunnels. Quik Stop or Scrapper Sam sell them.', "You're in the secret building?? Find out how the vault opens!", 'BRO YOU DID IT??',
  ];
  const L = {
    milo: () => `Milo: "${hints[Math.min(m, hints.length - 1)]}"`,
    mom: () => `Mom: "${G.pick(["Are you eating? Don't eat junkyard food.", 'Wear gloves! And come home before dark!', 'Your room is a junkyard too, you know.', 'I love you. Don\'t touch rats.'])}"`,
    unknown: () => '📵 The number you are calling does not exist. …or does it.',
    gus: () => `Gus: "${G.pick(['Who gave you this number? Oh. Me.', "I'm busy. Doing old man stuff. Not gaming.", 'Is this about the PS5? There is no PS5.'])}"`,
    rosa: () => `Rosa: "${G.has('fuse') || G.flags.helpedRosa ? 'BOLT says hi. BOLT also says your shoelace is untied.' : 'Three copper wires, kid. Check the big piles.'}"`,
    earl: () => 'Earl: "Zzzzzz… zzz… *click*"',
    sam: () => 'Sam: "Sam\'s Junk Hotline! If it\'s trash, we want it! …Wait, who is this?"',
  };
  return (L[id] || (() => '...'))();
}

// ambient messages per mission (random, Milo/Mom)
export const AMBIENT = [
  ['milo', 'bro did you find it yet?', ["I'm still looking 💀", 'almost bro'], 'keep searching. our future depends on this'],
  ['milo', 'imagine we finally get a PS5 and the first game we play is minecraft lol', ['LMAO', 'bro focus'], 'ok ok focus 🫡'],
  ['mom', 'Did you eat lunch?', ['yes mom', 'I ate a… sandwich 🙂'], 'Good. Wash your hands. TWICE.'],
  ['milo', 'what if the PS5 is cursed', ["then I'll play cursed games", 'bro stop'], 'fair'],
  ['mom', 'Why do your clothes smell like a garbage truck??', ['field research', "long story mom"], 'Laundry. Tonight.'],
  ['milo', 'update?? I refreshed this chat 47 times', ['still searching', 'getting close 👀'], 'GO GO GO'],
  ['sam', "psst. buying junk. any junk. come to my camp 🔥", ['ok', 'no thanks'], '👍'],
];

export const ENDINGS = {
  perfect: { title: 'PERFECT ENDING', sub: 'PS5 + GOLDEN CONTROLLER', text: ["You walk out of the bunker holding a PS5 in one hand and a glowing golden controller in the other.", "Gus doesn't even argue. He just salutes. Bandit howls.", "That night you and Milo play until 6 AM. The golden controller never drifts. Not once.", "Legends say it's still glowing."] },
  keep: { title: 'FINDERS KEEPERS', sub: 'TECHNICALLY A WIN', text: ['"Finders keepers," you say.', 'Gus sighs. "Fine. You earned it, kid. …But I\'m keeping the controller."', 'You plug in the PS5 at home. It boots up. It\'s beautiful.', 'You have no controller. You stare at the home screen for 3 hours. Milo calls it "the best worst day ever."'] },
  tyler: { title: 'THE REAL ONE', sub: 'GIVE IT BACK', text: ['You hand the PS5 to Tyler. His hands are shaking.', '"My mom threw it out because I got a D in math," he says. "I\'ve been sneaking around this junkyard every night."', '"…You want to come over and play? Like, every day?"', 'You become best friends. Tyler gets a B+ in math. His mom lets him keep it. Everyone wins. Even Gus gets invited on Sundays.'] },
  sell: { title: 'WHY BRO 💀', sub: 'SOLD IT TO SAM', text: ['You sell the PS5 to Scrapper Sam for $300.', 'Sam immediately sells it back to Tyler for $600.', 'You now have $300, no PS5, and a deep sense of emptiness.', 'Milo hasn\'t texted back. He left you on read. Forever.'] },
  squad: { title: 'BUNKER SQUAD', sub: 'TRUE ENDING', text: ['"What if… nobody keeps it?" you say. "What if it lives HERE?"', 'Gus blinks. Tyler blinks. Bandit blinks.', 'One week later: the bunker has a second couch, Rosa wired BOLT into a co-op tournament bracket, Milo brings snacks, Earl sleeps on the beanbag.', 'Every Friday night: JUNKYARD GAME NIGHT. You found the PS5. But honestly? You found the squad. 🎮'] },
};

// ---------------- missions ----------------
const near = (G, p, r) => Math.hypot(G.player.pos.x - p[0], G.player.pos.z - p[1]) < r;
export const MISSIONS = [
  { title: 'THE MESSAGE', steps: [
    { text: 'Open your phone 📱 and read the message from UNKNOWN NUMBER', on: (e) => e.type === 'read' && e.id === 'unknown',
      start: (G) => { G.msg('unknown', "Bro… there's a PS5 in the junkyard.", 0); G.msg('unknown', 'I saw it get thrown in. White box. GO.', 1.5); },
      done: (G) => { G.offerReply('unknown', ['who is this??', 'fr? 👀'], (G) => { G.msg('unknown', "doesn't matter. junkyard north of town. hurry before someone else finds it.", 2); G.msg('milo', 'BRO. did u get a text about a PS5 in the junkyard??', 5); G.offerReply('milo', ['YES BRO', "nah who's asking 💀"], (G) => G.msg('milo', 'GO GET IT. if you find it we\'re playing all night 🎮🎮', 2), 5.5); }); } },
    { text: 'Reply to the messages on your phone', on: (e) => e.type === 'reply' && e.id === 'milo' },
  ] },
  { title: 'ENTER THE JUNKYARD', steps: [
    { text: 'Go to the junkyard north of town', target: () => PLACES.junkGate, check: (G) => near(G, [0, 104], 12) },
    { text: 'Talk to the old worker at the gate', target: (G) => G.npcPos('gus'), check: (G) => G.flags.gateOpen, start: (G) => (G.flags.gusAtGate = true), done: (G) => (G.flags.gusAtGate = false) },
    { text: 'Enter the junkyard', target: () => [0, 90], check: (G) => G.zone === 'A', done: (G) => G.playCine('welcome') },
  ] },
  { title: 'SEARCH', steps: [
    { text: (G) => `Search garbage piles in the Front Lot — look at a pile & hold E (${Math.min(3, G.story.c.searchA || 0)}/3)`, on: (e, G) => e.type === 'search' && e.zone === 'A' && (G.story.c.searchA = (G.story.c.searchA || 0) + 1) >= 3,
      done: (G) => { G.msg('unknown', 'find anything? ask the old guy. he sees EVERYTHING.', 3); } },
  ] },
  { title: 'THE OLD WORKER', steps: [
    { text: 'Find Old Gus and ask about the white box', target: (G) => G.npcPos('gus'), on: (e) => e.type === 'talk' && e.id === 'gus_box' },
  ] },
  { title: 'THE LOCKED AREA', steps: [
    { text: 'Find the key Gus lost in the Car Graveyard (tip: 📡 Scanner app)', target: () => [135, 45], check: (G) => G.has('key') || G.flags.innerOpen },
    { text: 'Unlock the Locked Yard gate', target: () => PLACES.innerGate, check: (G) => G.flags.innerOpen, done: (G) => { G.msg('milo', 'bro gus just walked past my house humming the racing game theme. sus??', 4); } },
  ] },
  { title: 'SECURITY CAMERA', steps: [
    { text: 'Find the security shack in the Locked Yard', target: () => PLACES.shack, check: (G) => near(G, PLACES.shack, 9) },
    { text: 'Talk to Earl, the security guard', target: (G) => G.npcPos('earl'), on: (e) => e.type === 'talk' && e.id === 'earl_cam' },
    { text: "Ask Rosa at the garage (Front Lot) for a fuse", target: (G) => G.npcPos('rosa'), on: (e) => e.type === 'talk' && e.id === 'rosa_fuse' },
    { text: (G) => `Find copper wire in garbage piles (${Math.min(3, G.inv.copper || 0)}/3)`, check: (G) => (G.inv.copper || 0) >= 3 },
    { text: 'Bring the copper wire to Rosa', target: (G) => G.npcPos('rosa'), on: (e) => e.type === 'talk' && e.id === 'rosa_give' },
    { text: 'Install the fuse in the generator behind the security shack', target: () => PLACES.generator, on: (e) => e.type === 'use' && e.id === 'generator' },
    { text: 'Watch the old footage on the security monitor', target: () => PLACES.monitor, on: (e) => e.type === 'cine' && e.id === 'footage' },
  ] },
  { title: 'FOLLOW THE TRAIL', steps: [
    { text: (G) => `Photograph clues in the Container Maze with the 📷 Camera (${G.story.photoCount()}/3)`, target: (G) => G.story.nextClue(), check: (G) => G.story.photoCount() >= 3,
      start: (G) => G.discover('containers') },
    { text: 'Find where the trail ends', target: () => PLACES.fakeBox, check: (G) => near(G, PLACES.fakeBox, 7) },
  ] },
  { title: 'THE FAKE PS5', steps: [
    { text: 'Dig out the white box', target: () => PLACES.fakeBox, on: (e) => e.type === 'cine' && e.id === 'discovery' },
    { text: 'CHASE THE FOX! 🦊', target: (G) => G.npcPos('fox'), check: (G) => G.flags.foxArrived && near(G, PLACES.tunnel, 14), start: (G) => G.startFoxChase(),
      done: (G) => { G.msg('unknown', 'where foxes go, people follow. bring a light.', 3); G.discover('tunnel'); } },
  ] },
  { title: 'THE SECRET BUILDING', steps: [
    { text: "It's pitch black down there. Get a 🔦 flashlight (Quik Stop in town, or Scrapper Sam)", check: (G) => G.has('flashlight') },
    { text: 'Enter the tunnel', target: () => PLACES.tunnel, on: (e) => e.type === 'use' && e.id === 'tunnel' },
    { text: 'Find a way through the underground tunnels', target: () => PLACES.tunnelOut, on: (e) => e.type === 'use' && e.id === 'tunnelExit' },
    { text: 'Get inside the secret building', target: () => PLACES.secretDoor, on: (e) => e.type === 'use' && e.id === 'secretDoor', start: (G) => G.playCine('compound') },
  ] },
  { title: 'THE REAL PS5', steps: [
    { text: 'Search the bunker for clues about the vault code', target: () => PLACES.diary, on: (e) => e.type === 'talk' && e.id === 'diary' },
    { text: 'Open the vault', target: () => PLACES.vault, on: (e) => e.type === 'use' && e.id === 'vault' },
    { text: 'Decide the fate of the PS5', on: (e) => e.type === 'ending' },
  ] },
];

export class Story {
  constructor(G) { this.G = G; this.m = 0; this.s = 0; this.c = {}; this.photos = {}; this.done = false; this.started = false; this.pending = 0; }
  get mission() { return MISSIONS[this.m]; }
  get step() { return this.mission && this.mission.steps[this.s]; }
  text() { const st = this.step; if (!st) return ''; return typeof st.text === 'function' ? st.text(this.G) : st.text; }
  target() { const st = this.step; if (!st || !st.target) return null; return st.target(this.G); }
  photoCount() { return ['clue1', 'clue2', 'clue3'].filter((k) => this.photos[k]).length; }
  nextClue() { for (const k of ['clue1', 'clue2', 'clue3']) if (!this.photos[k]) return PLACES[k]; return PLACES.fakeBox; }
  begin(m = 0, s = 0) { this.m = m; this.s = s; this.started = true; this.G.missionBanner(m); this._startStep(); }
  _startStep() { const st = this.step; if (st && st.start) st.start(this.G); this.G.onObjective(); }
  emit(e) {
    if (!this.started || this.done || this.pending) return;
    const st = this.step; if (st && st.on && st.on(e, this.G)) this.advance();
    else this.G.onObjective();
  }
  update() {
    if (this.pending && this.G.t >= this.pending) { this.pending = 0; this.G.missionBanner(this.m); this._startStep(); this.G.autosave(); return; }
    const st = this.step; if (this.started && !this.done && !this.pending && st && st.check && st.check(this.G)) this.advance(); }
  advance() {
    const G = this.G, st = this.step; if (st && st.done) st.done(G);
    this.s++;
    if (this.s >= this.mission.steps.length) {
      G.missionComplete(this.m); this.m++; this.s = 0;
      if (this.m >= MISSIONS.length) { this.done = true; return; }
      this.pending = G.t + 3.2;
    } else { this._startStep(); G.autosave(); G.sfx('ding'); }
  }
  serialize() { return { m: this.m, s: this.s, c: this.c, photos: this.photos, done: this.done }; }
  load(d) { Object.assign(this, { m: d.m, s: d.s, c: d.c || {}, photos: d.photos || {}, done: !!d.done }); this.started = true; }
}

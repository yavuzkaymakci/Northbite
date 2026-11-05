// The old harbour captain's journal (GDD §15). Six pages: three on the main path, three found by exploring.
// Page texts and hints are in strings.ts (page{n}Title / page{n}Text / page{n}Hint).

export type PageId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'page6';

export type PageTrigger =
  | 'smokehouse' // the smokehouse opens
  | 'firstCrystal' // first crystal mined in the Ice Cave
  | 'firstPlatter' // first platter served at the camp
  | 'avalancheChest' // first avalanche chest opened
  | 'bearScared' // first bear scared away
  | 'hiddenSpot'; // the marker behind the rocks (zones.ts → StoryLayout.hidden)

export const Pages: ReadonlyArray<{ id: PageId; trigger: PageTrigger; main: boolean }> = [
  { id: 'page1', trigger: 'smokehouse', main: true },
  { id: 'page2', trigger: 'firstCrystal', main: true },
  { id: 'page3', trigger: 'firstPlatter', main: true },
  { id: 'page4', trigger: 'avalancheChest', main: false },
  { id: 'page5', trigger: 'bearScared', main: false },
  { id: 'page6', trigger: 'hiddenSpot', main: false },
];

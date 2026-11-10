// The old harbour captain's journal (GDD §15, §25). Ten pages: the main path, exploring, and the Harbour Pier (7–10).
// Page texts and hints are in strings.ts (page{n}Title / page{n}Text / page{n}Hint).

export type PageId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'page6' | 'page7' | 'page8' | 'page9' | 'page10';

export type PageTrigger =
  | 'smokehouse' // the smokehouse opens
  | 'firstCrystal' // first crystal mined in the Ice Cave
  | 'firstPlatter' // first platter served at the camp
  | 'avalancheChest' // first avalanche chest opened
  | 'bearScared' // first bear scared away
  | 'hiddenSpot' // the marker behind the rocks (zones.ts → StoryLayout.hidden)
  | 'harborDeed' // the Harbour Pier deed is bought (GDD §25)
  | 'firstVoyage' // the first voyage comes back
  | 'wreck' // the sunken ship's treasure holds the page
  | 'lighthouse'; // the lighthouse is fully repaired

export const Pages: ReadonlyArray<{ id: PageId; trigger: PageTrigger; main: boolean }> = [
  { id: 'page1', trigger: 'smokehouse', main: true },
  { id: 'page2', trigger: 'firstCrystal', main: true },
  { id: 'page3', trigger: 'firstPlatter', main: true },
  { id: 'page4', trigger: 'avalancheChest', main: false },
  { id: 'page5', trigger: 'bearScared', main: false },
  { id: 'page6', trigger: 'hiddenSpot', main: false },
  { id: 'page7', trigger: 'harborDeed', main: true },
  { id: 'page8', trigger: 'firstVoyage', main: true },
  { id: 'page9', trigger: 'wreck', main: false },
  { id: 'page10', trigger: 'lighthouse', main: true },
];

/** Dummy Eastbourne data for the hidden mock. Not real stories, events or sources. */
import pier from "@/assets/mock/pier.webp";
import highStreet from "@/assets/mock/high-street.webp";
import garden from "@/assets/mock/garden.webp";
import cliffs from "@/assets/mock/cliffs.webp";

import { addDays, detectSourceKind, ukToday, type MockEvent, type MockSource, type MockState, type MockStory, type WaitingItem } from "./eventsDeskRules";

const S = (id: string, name: string, url: string, autoPublish: boolean): MockSource => ({ id, name, url, kind: detectSourceKind(url), autoPublish });

export function seedState(today: string = ukToday()): MockState {
  const sources: MockSource[] = [
    S("herald", "Eastbourne Herald", "https://www.eastbourneherald.co.uk/rss", true),
    S("bournefree", "Bournefree Live", "https://bournefree.co.uk/feed/", false),
    S("council", "Eastbourne Borough Council", "https://www.lewes-eastbourne.gov.uk/news", false),
    S("sussexworld", "Sussex World", "https://www.sussexexpress.co.uk/news", false),
    S("theatres", "Eastbourne Theatres", "https://www.eastbournetheatres.co.uk/whats-on", true),
    S("towner", "Towner Eastbourne", "https://www.townereastbourne.org.uk/whats-on/", false),
    S("chamber", "Eastbourne unLtd", "https://members.eastbourneunltd.co.uk/ajax_website/ajax_retrieveevents.php", true),
    S("lamb", "The Lamb Inn", "https://thelambeastbourne.co.uk/events", false),
  ];
  const src = (id: string) => sources.find((s) => s.id === id)!;
  const E = (id: string, title: string, offset: number, time: string | null, venue: string, sourceId: string): MockEvent => ({
    id, title, date: addDays(today, offset), time, venue, sourceName: src(sourceId).name, sourceUrl: src(sourceId).url,
  });

  const liveEvents: MockEvent[] = [
    E("e-past", "Pier Quiz Night", -1, "19:00", "Eastbourne Pier", "chamber"),
    E("e1", "Jazz at The Lamb", 0, "20:00", "The Lamb Inn, Old Town", "lamb"),
    E("e2", "The Nutcracker", 2, "19:30", "Congress Theatre", "theatres"),
    E("e3", "Seafront Farmers' Market", 3, "09:00", "Western Lawns", "chamber"),
    E("e4", "Winter Lights Walk", 4, "17:30", "Bandstand to Wish Tower", "chamber"),
    E("e5", "Family Print Workshop", 5, "10:30", "Towner Eastbourne", "towner"),
    E("e6", "Eastbourne Borough v Hampton", 7, "15:00", "Priory Lane", "chamber"),
    E("e7", "Christmas Lights Switch-On", 9, "16:00", "Terminus Road", "chamber"),
    E("e8", "Messiah by Candlelight", 11, "19:00", "St Saviour's Church", "theatres"),
    E("e-far", "New Year's Day Dip", 20, "11:00", "Fisherman's Green", "chamber"),
  ];

  const story = (id: string, title: string, sourceId: string, slides: string[], image?: string, author?: string): MockStory =>
    ({ id, title, sourceId, slides, image, author });

  const live: MockStory[] = [
    story("s1", "Pier reopens its East Deck after winter repairs", "herald", [
      "The East Deck of Eastbourne Pier reopened this morning after six weeks of repairs to its timber boards.",
      "Owners say the work replaced more than 400 planks damaged in October's storms.",
      "The arcade and tea rooms stay open as normal through the winter.",
    ], pier, "Sam Hart"),
    story("s2", "Terminus Road shops report busiest weekend since summer", "bournefree", [
      "Traders on Terminus Road say footfall rose by a fifth over the weekend.",
      "The town's business group credits the new late-night Thursday opening.",
    ], highStreet),
    story("s3", "Lifeboat crew called out twice in one night", "herald", [
      "Eastbourne's all-weather lifeboat launched twice on Saturday night.",
      "Both callouts were to small boats in difficulty off Beachy Head. Everyone was brought ashore safely.",
    ], cliffs, "Priya Shah"),
    story("s4", "Council confirms new bin collection days from January", "council", [
      "Most households will move to a new collection day from 6 January.",
      "Letters with each home's new day will arrive before Christmas.",
    ]),
    story("s5", "Volunteers plant 300 trees at Shinewater Park", "sussexworld", [
      "More than 60 volunteers turned out on Sunday to plant native trees around the lake.",
      "The park's friends group hopes to plant another 300 next spring.",
    ], garden),
    story("s6", "Seafront cycle lane plan goes out to consultation", "council", [
      "Residents have until the end of the month to comment on a new cycle lane along Royal Parade.",
    ]),
    story("s7", "Old Town bakery wins regional award", "bournefree", [
      "A family bakery on High Street has been named the best in Sussex at this year's food awards.",
    ]),
    story("s8", "Hospital car park to add 120 spaces", "herald", [
      "Work starts next month on a new deck at the District General Hospital car park.",
    ]),
    story("s9", "Wish Tower café plans approved", "council", [
      "Councillors have approved plans for a new café on the Wish Tower slopes.",
    ], pier),
    story("s10", "Borough sign striker on loan", "sussexworld", [
      "Eastbourne Borough have signed a striker on a month's loan ahead of Saturday's home match.",
    ]),
    story("s11", "Beach hut prices rise for next season", "council", [
      "Annual beach hut rents will rise by 4% from April.",
    ]),
    story("s12", "Langney library extends weekend hours", "bournefree", [
      "The library will now open on Sunday afternoons, starting this weekend.",
    ], highStreet),
    story("s13", "Charity swim raises £12,000", "herald", [
      "Forty swimmers braved a 9°C sea to raise money for the hospice.",
    ]),
    story("s14", "Station forecourt work finishes early", "sussexworld", [
      "The new taxi rank and bus stops outside the station are open a week ahead of schedule.",
    ]),
    story("s15", "Meads residents call for 20mph limit", "bournefree", [
      "A petition with 800 names has been handed to the council.",
    ], cliffs),
    story("s16", "School choir to sing at the Royal Albert Hall", "herald", [
      "Pupils from a Hampden Park primary school will perform at a national schools concert in March.",
    ]),
    story("s17", "Sovereign Harbour gets new water taxi", "sussexworld", [
      "A small water taxi will link the harbour's four basins from the spring.",
    ], garden),
  ];

  const waiting: WaitingItem[] = [
    { type: "story", id: "w1", minsAgo: 6, story: story("ws1", "Bandstand concerts return for Christmas season", "bournefree", [
      "The bandstand will host four free Christmas concerts this December.",
      "Brass bands from across Sussex are on the bill.",
    ]) },
    { type: "event", id: "w2", minsAgo: 14, sourceId: "towner", event: E("we1", "Late Night at Towner", 4, "18:00", "Towner Eastbourne", "towner") },
    { type: "story", id: "w3", minsAgo: 38, story: story("ws2", "Plans lodged to turn former bank into flats", "sussexworld", [
      "A developer wants to convert the old bank on Cornfield Road into 14 flats.",
    ]) },
    { type: "event", id: "w4", minsAgo: 52, sourceId: "lamb", event: E("we2", "Open Mic Night", 6, "20:00", "The Lamb Inn, Old Town", "lamb") },
    { type: "story", id: "w5", minsAgo: 95, story: story("ws3", "Night-time road closures on the A22 next week", "council", [
      "The A22 will close overnight between Hailsham and Polegate for resurfacing.",
    ]) },
  ];

  return { today, sources, waiting, live, liveEvents };
}

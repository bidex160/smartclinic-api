export type Text = { title: string; body: string };

/** Server-side words for Play. Keep {placeholders} exactly as in English. */
export interface PlayServerText {
  /** One short health fact per Health Word id (w01…). */
  facts: Record<string, string>;
  messages: {
    challengeNudge: Text;
    challengeLead: Text;
    challengeJoined: Text;
    challengeWon: Text;
    challengeResult: Text;
    /** The challenge ended and nobody scored. */
    challengeNoScore: Text;
    wordNudge: Text;
  };
}

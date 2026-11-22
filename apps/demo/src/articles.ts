export interface Article {
  slug: string;
  title: string;
  dek: string;
  section: string;
  minutes: number;
  body: string;
}

export const ARTICLES: Article[] = [
  {
    slug: 'the-hour-the-grid-asks',
    title: 'The hour the grid asks software to wait',
    dek: 'Demand peaks are short. Most product features are not.',
    section: 'Grid',
    minutes: 4,
    body: 'A regional grid does not run at one steady price or one steady carbon intensity. Late afternoon in southern India can look nothing like dawn. Software that treats every hour as identical keeps the expensive path switched on while turbines and reservoirs are already working hard. Waiting is a product decision, not only an infrastructure one. A summary, a preview render, or an autoplay video can move by an hour and the reader barely notices. The grid notices immediately. GreenGate treats that hour as a trait on the person reading, and lets the flag platform decide what is allowed to run.',
  },
  {
    slug: 'a-summary-is-a-power-decision',
    title: 'A summary is a power decision',
    dek: 'The model call is the heavy feature. The article is not.',
    section: 'Product',
    minutes: 5,
    body: 'The words on a news page are cheap to send. The summary above them is not, once a model is in the path. A live summary pulls compute, often in a region the reader never chose. A cached sentence does almost none of that work. Pausing the summary does none of it. Readers still have the article. Teams hide this choice inside a permanent "smart" default and then wonder why the energy chart only goes up. Putting the choice on a flag makes it visible, reversible, and different for two readers standing on two different grids. That is the whole product.',
  },
  {
    slug: 'southern-india-evening',
    title: 'What an evening peak does to a product',
    dek: 'IN-SO is the default zone because that is where this demo starts.',
    section: 'Zones',
    minutes: 4,
    body: 'Electricity Maps scores a zone against its own recent history, not against a global league table. Low in one place is not low in another. Southern India, Germany, and France can share a clock and not share a grid. A product that ships one behaviour worldwide is guessing. A product that asks for the zone, then asks a flag platform what to do, is at least guessing in the open. This reader defaults to IN-SO when it cannot tell where you are. You can force the level from the dev panel. The badge will say when the number is simulated.',
  },
  {
    slug: 'cache-is-a-climate-tool',
    title: 'Cache is a climate tool',
    dek: 'Eco mode is not a worse product. It is a remembered one.',
    section: 'Design',
    minutes: 3,
    body: 'Eco mode in this reader keeps a single extracted sentence and a still image. It does not pretend the sentence was written by a model. The label says local stand-in, or live model if a key was configured. Caching is the point. The second reader, and the hundredth, should not pay the first reader\'s compute. Feature flags are good at this because the rule lives outside the deploy. When the grid eases, the same flag can hand the long summary back without a release. The article never moved.',
  },
  {
    slug: 'flags-as-a-dimmer',
    title: 'Feature flags as a dimmer switch',
    dek: 'Full, eco, and off are three stops, not a boolean.',
    section: 'Flags',
    minutes: 4,
    body: 'A boolean flag can hide a button. It cannot describe a dimmer. Multivariate flags can. Full keeps the live summary and the moving hero. Eco keeps a short cached line and a still. Off leaves a plain sentence: the summary is paused because the grid is dirty right now. Segments bind those stops to a trait called carbon_level. The application does not contain the rule. It reports the trait and renders whatever value comes back. That split is what makes the rule editable by someone who does not want to ship code at dusk.',
  },
  {
    slug: 'the-quiet-homepage',
    title: 'The quiet version of a homepage',
    dek: 'Autoplay is a default we copied from a louder decade.',
    section: 'Design',
    minutes: 3,
    body: 'Autoplay video became a habit because it moved a metric, not because readers asked for it. On a clean grid the cost can be shrugged off. On a dirty hour it is a strange thing to insist on. This page plays an animated stand-in only in full mode. Eco mode holds a still. Off mode holds nothing but the pause note. The article underneath is the same length. If completion stays steady while the heavy path goes quiet, the loud default was never the product. That is the hypothesis the experiment is for.',
  },
  {
    slug: 'measuring-a-guess',
    title: 'Measuring a guess, honestly',
    dek: 'The watt-hours on this page are an estimate. The label says so.',
    section: 'Method',
    minutes: 4,
    body: 'A reader cannot see watt-hours. Any number on this page is a model: about 0.3 Wh for a live summary, about 0.05 Wh for a cached one, about 0.2 Wh for the autoplay hero, and a grid intensity that defaults to 450 grams of CO₂ per kilowatt-hour. Zone overrides are assumptions too. The meter exists so the drop is visible when eco or off takes over, not so anyone can file it as an audit. Saved versus always-full is the comparison that matters. Always-full is what this page would have done if the flag did not exist.',
  },
  {
    slug: 'when-off-is-the-feature',
    title: 'When off is the feature',
    dek: 'Pausing is a design, not a failure.',
    section: 'Product',
    minutes: 3,
    body: 'Off mode feels like a broken page if you do not explain it. Explained, it is a courtesy. The copy is specific: paused because the grid is dirty right now. The article remains. The reader can finish it, and that finish is the conversion the experiment counts. A kill switch sits beside the carbon rules. If greengate_enabled is turned off, every identity gets the full experience, dirty grid or not. The dimmer is itself behind a flag. That is how you ship a strong default without trapping yourself in it.',
  },
];

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

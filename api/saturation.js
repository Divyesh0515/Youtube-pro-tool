module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { tags } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });
  if (!tags) return res.status(400).json({ error: 'Tags required' });

  try {
    const tagList = tags.split(',').slice(0,3);
    const results = {};

    for (const tag of tagList) {
      const q = tag.trim();
      if (!q) continue;
      const after = new Date(); after.setDate(after.getDate()-90);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&regionCode=US&relevanceLanguage=en&publishedAfter=${after.toISOString()}&maxResults=5&videoDuration=medium&key=${key}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) continue;
      const count = d.pageInfo?.totalResults||0;
      const level = count<10?'🟢 WIDE OPEN':count<50?'🟡 LOW':count<200?'🟠 MEDIUM':'🔴 SATURATED';
      results[q] = { count, level, score: count<10?95:count<50?75:count<200?50:20 };
    }

    return res.status(200).json({ results });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

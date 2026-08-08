module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { id } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });
  if (!id) return res.status(400).json({ error: 'Video ID required' });
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${key}`);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    if (!d.items?.length) return res.status(404).json({ error: 'Video not found' });
    const v = d.items[0];
    const views=parseInt(v.statistics.viewCount||0), likes=parseInt(v.statistics.likeCount||0);
    const comments=parseInt(v.statistics.commentCount||0);
    const daysAgo=Math.floor((new Date()-new Date(v.snippet.publishedAt))/86400000);
    const vph=daysAgo>0?Math.round(views/(daysAgo*24)):views;
    const dur=v.contentDetails.duration;
    const m=dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];
    const mins=(parseInt(m[1]||0)*60)+parseInt(m[2]||0);
    let score=50;
    if(views>1000000)score+=20;else if(views>500000)score+=15;else if(views>100000)score+=10;else if(views>50000)score+=5;
    if(views>0&&likes/views>0.05)score+=15;else if(views>0&&likes/views>0.02)score+=8;
    if(daysAgo<=3)score+=15;else if(daysAgo<=7)score+=10;else if(daysAgo<=14)score+=5;
    if(mins>=8&&mins<=25)score+=5;
    score=Math.min(99,score);
    const tags=v.snippet.tags||[];
    const hasNumber=/\d/.test(v.snippet.title);
    const titleLen=v.snippet.title.length;
    return res.status(200).json({ video:{
      id:v.id, title:v.snippet.title, description:v.snippet.description.substring(0,500),
      channel:v.snippet.channelTitle, channelId:v.snippet.channelId,
      views, likes, comments, vph, daysAgo, mins, score,
      likeRatio:views>0?((likes/views)*100).toFixed(2):0,
      commentRatio:views>0?((comments/views)*100).toFixed(2):0,
      thumbnail:v.snippet.thumbnails?.maxres?.url||v.snippet.thumbnails?.high?.url||'',
      publishedAt:v.snippet.publishedAt, tags, hasNumber, titleLen,
      url:`https://www.youtube.com/watch?v=${v.id}`
    }});
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lang = 'de', maxSubs = 20000, minViews = 50000 } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });

  const langMap = {
    en: { code: 'en', region: 'US', name: 'English 🇺🇸' },
    de: { code: 'de', region: 'DE', name: 'German 🇩🇪' },
    fr: { code: 'fr', region: 'FR', name: 'French 🇫🇷' },
    ru: { code: 'ru', region: 'RU', name: 'Russian 🇷🇺' },
    es: { code: 'es', region: 'ES', name: 'Spanish 🇪🇸' },
    it: { code: 'it', region: 'IT', name: 'Italian 🇮🇹' },
    pt: { code: 'pt', region: 'BR', name: 'Portuguese 🇧🇷' },
    nl: { code: 'nl', region: 'NL', name: 'Dutch 🇳🇱' },
    sv: { code: 'sv', region: 'SE', name: 'Swedish 🇸🇪' },
    pl: { code: 'pl', region: 'PL', name: 'Polish 🇵🇱' }
  };

  const L = langMap[lang] || langMap['de'];

  try {
    // Step 1: Search videos uploaded in last 5-6 days with high views
    const after = new Date();
    after.setDate(after.getDate() - 6); // Last 6 days only

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&regionCode=${L.region}&relevanceLanguage=${L.code}&publishedAfter=${after.toISOString()}&maxResults=50&order=viewCount&videoDuration=medium&key=${key}`;

    const sr = await fetch(searchUrl);
    const sd = await sr.json();
    if (sd.error) return res.status(400).json({ error: sd.error.message });

    const items = sd.items || [];
    if (!items.length) return res.status(200).json({ gems: [], message: 'No videos found for this language' });

    // Step 2: Get video stats to filter 50K+ views
    const videoIds = items.map(i => i.id.videoId).filter(Boolean).join(',');
    if (!videoIds) return res.status(200).json({ gems: [] });

    const vsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${key}`;
    const vsr = await fetch(vsUrl);
    const vsd = await vsr.json();
    if (vsd.error) return res.status(400).json({ error: vsd.error.message });

    // Filter: 50K+ views AND 5 min+ AND last 6 days
    const viralVideos = (vsd.items || []).filter(v => {
      const views = parseInt(v.statistics.viewCount || 0);
      const dur = v.contentDetails.duration;
      const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
      const mins = (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
      const daysAgo = Math.floor((new Date() - new Date(v.snippet.publishedAt)) / 86400000);
      return views >= parseInt(minViews) && mins >= 5 && daysAgo <= 6;
    });

    if (!viralVideos.length) {
      return res.status(200).json({ gems: [], message: `No videos with ${parseInt(minViews).toLocaleString()}+ views in last 6 days. Try lower min views.` });
    }

    // Step 3: Get unique channel IDs from viral videos
    const channelIds = [...new Set(viralVideos.map(v => v.snippet.channelId).filter(Boolean))];

    // Step 4: Check channel subscriber counts - find SMALL channels
    const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds.join(',')}&key=${key}`;
    const cr = await fetch(chUrl);
    const cd = await cr.json();
    if (cd.error) return res.status(400).json({ error: cd.error.message });

    // Filter: under maxSubs subscribers = small channel with viral video = HIDDEN GEM
    const smallChannels = (cd.items || []).filter(ch => {
      const subs = parseInt(ch.statistics.subscriberCount || 0);
      return subs > 0 && subs <= parseInt(maxSubs);
    });

    if (!smallChannels.length) {
      return res.status(200).json({ 
        gems: [], 
        message: `Found ${viralVideos.length} viral videos but all channels have ${parseInt(maxSubs).toLocaleString()}+ subs. Try increasing max subs filter.`,
        debug: { viralVideos: viralVideos.length, channelsChecked: channelIds.length }
      });
    }

    // Step 5: Build gem data
    const gems = [];

    for (const ch of smallChannels) {
      // Find the viral videos from this channel
      const chVideos = viralVideos.filter(v => v.snippet.channelId === ch.id);
      
      // Get last 6 videos of this channel to show pattern
      const recentUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ch.id}&type=video&order=date&maxResults=6&videoDuration=medium&key=${key}`;
      const recentR = await fetch(recentUrl);
      const recentD = await recentR.json();
      const recentIds = (recentD.items || []).map(i => i.id.videoId).filter(Boolean).join(',');

      let recentVideos = chVideos; // fallback
      if (recentIds) {
        const rvUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${recentIds}&key=${key}`;
        const rvr = await fetch(rvUrl);
        const rvd = await rvr.json();
        recentVideos = (rvd.items || []).map(v => {
          const dur = v.contentDetails.duration;
          const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
          const mins = (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
          const views = parseInt(v.statistics.viewCount || 0);
          const likes = parseInt(v.statistics.likeCount || 0);
          const daysAgo = Math.floor((new Date() - new Date(v.snippet.publishedAt)) / 86400000);
          return {
            id: v.id,
            title: v.snippet.title,
            views, likes, mins, daysAgo,
            likeRatio: views > 0 ? ((likes / views) * 100).toFixed(1) : 0,
            thumbnail: v.snippet.thumbnails?.medium?.url || '',
            tags: v.snippet.tags || [],
            publishedAt: v.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${v.id}`
          };
        }).filter(v => v.mins >= 5);
      }

      if (!recentVideos.length) continue;

      const avgViews = Math.round(recentVideos.reduce((s, v) => s + v.views, 0) / recentVideos.length);
      const maxViews = Math.max(...recentVideos.map(v => v.views));
      const allTags = [...new Set(recentVideos.flatMap(v => v.tags))].slice(0, 20);

      // Niche hint from titles
      const wordFreq = {};
      recentVideos.forEach(v => {
        v.title.toLowerCase().split(/\s+/).forEach(w => {
          w = w.replace(/[^a-z]/g, '');
          if (w.length > 3) wordFreq[w] = (wordFreq[w] || 0) + 1;
        });
      });
      const nicheWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w).join(', ');

      // Growth velocity
      const sorted = [...recentVideos].sort((a, b) => a.daysAgo - b.daysAgo);
      const recent = sorted.slice(0, Math.ceil(sorted.length / 2));
      const older = sorted.slice(Math.ceil(sorted.length / 2));
      const recentAvg = recent.length ? Math.round(recent.reduce((s, v) => s + v.views, 0) / recent.length) : 0;
      const olderAvg = older.length ? Math.round(older.reduce((s, v) => s + v.views, 0) / older.length) : 0;
      const growth = olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0;

      const subs = parseInt(ch.statistics.subscriberCount || 0);

      gems.push({
        channel: {
          id: ch.id,
          name: ch.snippet.title,
          subs,
          country: ch.snippet.country || L.region,
          thumbnail: ch.snippet.thumbnails?.default?.url || '',
          language: L.name,
          url: `https://www.youtube.com/channel/${ch.id}`
        },
        videos: recentVideos.slice(0, 6),
        stats: {
          avgViews,
          maxViews,
          growthVelocity: growth,
          trend: growth > 50 ? '🚀 EXPLODING' : growth > 20 ? '📈 GROWING FAST' : growth > 0 ? '📊 GROWING' : '➡️ STABLE',
          allTags,
          nicheHint: nicheWords
        }
      });
    }

    gems.sort((a, b) => b.stats.maxViews - a.stats.maxViews);
    return res.status(200).json({ gems, language: L.name, total: gems.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

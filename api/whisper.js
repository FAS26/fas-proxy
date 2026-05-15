// AssemblyAI proxy
// upload-token: gets a temporary token for direct browser upload
// submit: submits audio_url for transcription
// poll: checks transcription status

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Action, X-Transcript-Id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.headers['x-action'] || 'upload-token';
  const AAI_KEY = process.env.ASSEMBLYAI_KEY;

  try {
    // Get a temporary upload token — browser uses this to upload directly to AssemblyAI
    if (action === 'upload-token') {
      const tokenRes = await fetch('https://api.assemblyai.com/v2/realtime/token', {
        method: 'POST',
        headers: {
          'authorization': AAI_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expires_in: 3600 }),
      });

      // AssemblyAI v2 upload token endpoint
      // If that fails, just return the key directly for upload auth
      if (!tokenRes.ok) {
        // Fallback: return a signed approach using direct upload URL
        return res.status(200).json({ 
          upload_auth: AAI_KEY,
          upload_url: 'https://api.assemblyai.com/v2/upload'
        });
      }

      const data = await tokenRes.json();
      return res.status(200).json({ 
        upload_auth: data.token || AAI_KEY,
        upload_url: 'https://api.assemblyai.com/v2/upload'
      });
    }

    // Submit audio_url for transcription
    if (action === 'submit') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': AAI_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ 
          audio_url: body.audio_url || body.upload_url,
          speaker_labels: false 
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(submitRes.status).json({ error: err });
      }

      const { id } = await submitRes.json();
      return res.status(200).json({ transcript_id: id });
    }

    // Poll transcription status
    if (action === 'poll') {
      const transcriptId = req.headers['x-transcript-id'];
      if (!transcriptId) return res.status(400).json({ error: 'Missing x-transcript-id' });

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'authorization': AAI_KEY },
      });

      if (!pollRes.ok) {
        const err = await pollRes.text();
        return res.status(pollRes.status).json({ error: err });
      }

      const data = await pollRes.json();
      return res.status(200).json({
        status: data.status,
        text: data.text || null,
        error: data.error || null,
      });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (error) {
    console.error('Whisper proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

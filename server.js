const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Running!' });
});

// Create video - WORKING VERSION
app.post('/create-video', async (req, res) => {
  const { audioUrl, imageUrl } = req.body;
  
  const uniqueId = Date.now();
  const audioPath = `/tmp/audio_${uniqueId}.mp3`;
  const imagePath = `/tmp/image_${uniqueId}.jpg`;
  const outputPath = `/tmp/output_${uniqueId}.mp4`;

  try {
    // Download files (FFmpeg can't always handle Google Drive URLs directly)
    console.log('Downloading files...');
    const audioData = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, audioData.data);
    
    const imageData = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageData.data);

    // Create video with image looped for audio duration
    console.log('Creating video...');
    const ffmpegCommand = `ffmpeg -loop 1 -i ${imagePath} -i ${audioPath} -c:v libx264 -preset veryfast -crf 30 -c:a aac -b:a 128k -shortest -pix_fmt yuv420p ${outputPath} -y`;
    
    await execPromise(ffmpegCommand);
    
    // Upload to Cloudinary
    console.log('Uploading...');
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs'
    });

    // Clean up
    fs.unlinkSync(audioPath);
    fs.unlinkSync(imagePath);
    fs.unlinkSync(outputPath);
    
    res.json({
      success: true,
      videoUrl: result.secure_url
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 10000);

const express = require('express');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// Configure Cloudinary (we'll set this up next)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'FFmpeg Video API is running!' });
});

// Create video endpoint
app.post('/create-video', async (req, res) => {
  const { audioUrl, imageUrl, duration = 180 } = req.body;
  
  if (!audioUrl || !imageUrl) {
    return res.status(400).json({ error: 'audioUrl and imageUrl are required' });
  }

  try {
    console.log('Starting video creation...');
    
    // Create temp directory
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    // Generate unique filenames
    const uniqueId = Date.now();
    const audioPath = path.join(tempDir, `audio_${uniqueId}.mp3`);
    const imagePath = path.join(tempDir, `image_${uniqueId}.jpg`);
    const outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

    // Download files
    console.log('Downloading audio...');
    const audioResponse = await axios.get(audioUrl, { responseType: 'stream' });
    const audioStream = fs.createWriteStream(audioPath);
    audioResponse.data.pipe(audioStream);
    
    console.log('Downloading image...');
    const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
    const imageStream = fs.createWriteStream(imagePath);
    imageResponse.data.pipe(imageStream);

    // Wait for downloads to complete
    await new Promise((resolve) => audioStream.on('finish', resolve));
    await new Promise((resolve) => imageStream.on('finish', resolve));

    console.log('Creating video with FFmpeg...');
    
    // Create video
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(imagePath)
        .loop(duration)
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-tune stillimage',
          '-c:a aac',
          '-b:a 192k',
          '-pix_fmt yuv420p',
          '-shortest'
        ])
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    console.log('Uploading to Cloudinary...');
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs'
    });

    // Clean up temp files
    fs.unlinkSync(audioPath);
    fs.unlinkSync(imagePath);
    fs.unlinkSync(outputPath);

    console.log('Video created successfully!');
    
    res.json({
      success: true,
      videoUrl: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

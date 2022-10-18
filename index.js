const app = require('express')();
const mongoose = require('mongoose');
const config = require('./config.js');
const colors = require('colors');
const adminSchema = require('./adminSchema.js');
const gameSchema = require('./gameSchema.js');

const adminDb = mongoose.model("Admin", adminSchema)
const gameDb = mongoose.model("Game", gameSchema)

const domain = config.local ? config.localDomain : config.domain;

async function fetchGames() {
    return await gameDb.find({}).clone().exec()
}

async function fetchGame(id) {
    let game = await gameDb.findById(id).clone();
    if(!game) return null;
    return game;
}

app.get('/api/games', async (req, res) => {
    const games = await fetchGames()
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000")
    return res.send({success: true, games}).status(200)
})

app.get('/api/header/games', async (req, res) => {
    const games = await fetchGames()
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000")
    const sortedGames = games.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
    let finalGames = [];
    for(let i = 0; i < 5; i++) {
        const game = sortedGames[i]
        const data = {
            name: game.name,
            id: game.id,
            releaseDate: game.releaseDate
        };
        finalGames.push(data);
    }
    // setTimeout(() => {
    return res.send({success: true, games: finalGames}).status(200)
    // }, 5000)
})

app.get('/api/games/:gameId', async (req, res) => {
    const game = await fetchGame(req.params.gameId)
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000")
    return res.send({success: true, game}).status(200)
})

app.listen(config.port, null, async () => {
    console.log(`✅ App started on port ${config.port} (${domain}${config.port === 80 ? "" : `:${config.port}`}/)`.green)
    await mongoose.connect(config.mongoDbUri, {
      useUnifiedTopology: true,
      useNewUrlParser: true
    }).then(async () => {
      console.log('✅ MongoDB connected'.green);
      require('./bot.js');
    })
})
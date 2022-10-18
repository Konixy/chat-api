const {Schema} = require('mongoose');

module.exports = new Schema({
    _id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: false
    },
    tutorial: {
      type: String,
      required: false
    },
    releaseDate: {
      type: String,
      required: false
    },
    lastUpdate: {
      type: String,
      required: false
    },
    bgUrl: {
      type: String,
      required: false
    },
    coverUrl: {
      type: String,
      required: false
    },
    videoId: {
      type: String,
      required: false
    },
    crackDlLink: {
      type: String,
      required: false
    },
    crackDlSize: {
      type: String,
      required: false
    },
    crackDlLinkType: {
      type: String,
      required: false
    },
    isOnline: {
      type: String,
      required: false
    },
    additionalLinks: [{
      name: {required: false, type: String},
      link: {required: false, type: String},
      linkType: {required: false, type: String},
    }]
})
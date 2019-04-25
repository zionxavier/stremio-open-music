const needle = require('needle')

const package = require('./package')

const manifest = {
    id: 'org.open.music',
    version: package.version,
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Circle-icons-speaker.svg/600px-Circle-icons-speaker.svg.png',
    name: 'Open Music',
    description: 'Music Streams from Open Directories',
    resources: ['stream', 'meta', 'catalog'],
    types: ['other', 'tv'],
    idPrefixes: ['openmusic:'],
    catalogs: [
      {
        id: 'openmusiccat',
        name: 'Open Music',
        type: 'tv',
        extra: [
          {
            name: 'search',
            isRequired: true
          }
        ]
      }
    ]
}

const { addonBuilder, serveHTTP, publishToCentral }  = require('stremio-addon-sdk')

const addon = new addonBuilder(manifest)

function minTwoDigits(n) {
  return (n < 10 ? '0' : '') + n
}

function toStream(meta) {
  return {
    title: meta.file + '\n' + meta.reg_date + (meta.filesize ? ' | ' + meta.filesize : '') + (meta.filetype ? ' | ' + meta.filetype : ''),
    url: meta.link.split('\\').join('')
  }
}

function noSpecialChars(str) {
  return str.replace(/[^\w\s]/gi, '').replace(/ {1,}/g, ' ').trim()
}

function search(query) {
  return new Promise((resolve, reject) => {
    needle.post('https://filepursuit.com/jsn/v1/search.php', { searchQuery: query, type: 'audio' }, (err, resp, body) => {
      if (err)
        reject(err)
      else if (body && Array.isArray(body) && body.length)
        resolve(body.map(toStream))
      else
        reject(new Error('Response body is empty'))
    })
  })  
}

function atob(str) {
  return Buffer.from(str, 'base64').toString('binary')
}

function btoa(str) {
  return Buffer.from(str.toString(), 'binary').toString('base64')
}

addon.defineCatalogHandler(args => {
  return new Promise((resolve, reject) => {
    resolve({
      metas: [
        {
          id: 'openmusic:' + btoa(args.extra.search),
          name: 'Click for Music Results',
          poster: 'https://cdn-az.allevents.in/banners/18914930-3283-11e9-8faf-bbc45c200318-rimg-w300-h300-gmir.jpg',
          posterShape: 'square',
          type: 'tv'
        }
      ]
    })
  })
})

addon.defineMetaHandler(args => {
  return new Promise((resolve, reject) => {

    resolve({
      meta: {
        id: args.id,
        name: atob(args.id.replace('openmusic:', '')),
        logo: 'https://cdn-az.allevents.in/banners/18914930-3283-11e9-8faf-bbc45c200318-rimg-w300-h300-gmir.jpg',
        type: 'tv'
      }
    })
  })
})

const cache = {}

addon.defineStreamHandler(args => {
  return new Promise((resolve, reject) => {
    if (cache[args.id]) {
      resolve({ streams: cache[args.id] })
      return
    }

    const query = atob(args.id.replace('openmusic:', ''))

    function respond(streams) {
      cache[args.id] = streams
      // cache for 4 days
      setTimeout(() => {
        delete cache[args.id]
      }, 86400000)
      resolve({ streams, cacheMaxAge: 86400 }) // cache for 1 day
    }

    search(encodeURIComponent(query)).then(streams => {
      respond(streams)
    }).catch(err => {
      // try removing special chars from query
      if (query != noSpecialChars(query)) {
        search(encodeURIComponent(noSpecialChars(query))).then(streams => {
          respond(streams)
        }).catch(err => {
          reject(err)
        })
      } else
        reject(err)
    })

  })
})

module.exports = addon.getInterface()

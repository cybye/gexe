
// const Buffer = require('safe-buffer').Buffer
 
 /*
  * the object ipfs is available in the global namespace
  */

const announcements = 'QmTPwaRX54sP3AGUBtk7vcY2sa6Qjhruhu1sF6P4Jg8Emp'

/// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.on('ready', () => {

  ipfs.id().then( (x) => {
    const room = Room(ipfs, announcements)

    const manager = new Manager(x.id, (x) => room.broadcast(x), (x,y) => room.sendTo(x,y) )

    
    room.on('peer joined', (peer) => {
      console.log('-- Peer joined the room', peer)
    })

    room.on('peer left', (peer) => {
      console.log('-- Peer left...', peer)
    })

    // now started to listen to room
    room.on('subscribed', () => {

      console.log('-- Node ready')
      setInterval( () => {

         var time = Date.now()
         var n = 10

        // post({type: announce, { id: 'my-announcement', type:'service', fulfillment: { jscript: ... }}})
         manager.announce(
           /*id*/
           'my-execution-request',
           /*announcement*/
           {type: 'execution'},
           /* fulfillment */
           {javascript: `onmessage=function(e) { postMessage('from worker: ' + e.data) }; postMessage('worker ready');`},
           /* listener */
          (err, data, reply) => {
            console.warn(`FROM WEBWORKER after ${Date.now() - time}ms\n   received "${data}" `)
            if(0<--n) {
              time = Date.now()
              reply(`here we go, round=${n}`)
            }
          }
          )}, 10000)
    })

    room.on('message', (message) => {
      manager.receive(message.from, message.data)
    })



  })

}) 


class Message {
  constructor(type, payload) {
    this.type = type
    this.payload = payload
  }

  serialize() {
    return Buffer.from(JSON.stringify(this))
  }

  static deserialize(buffer) {
    // not really a message object
    const o = JSON.parse(buffer.toString())
    return new Message(o.type, o.payload)
  }
}

  
class Manager {

  constructor(id, broadcast, sendTo) {
    this.id = id
    this._broadcast = broadcast
    this._sendTo = sendTo


    this.receivedAnnouncements = {}
    this.announcements = {}

    this.resources = 1

    this.trace = console.log
    this.log = console.log
    this.warn = console.warn
  }

  receive(from, data) {
    if(from == this.id) 
      return // early -- console.log('message from self')
    
    const message = Message.deserialize(data)

    this.trace(`received ${JSON.stringify(message)} from ${from}`)

    switch (message.type) {
      case 'announcement':
        this.handleAnnouncement(from, message.payload)
        break
      case 'offer': 
        this.handleOffer(from, message.payload)
        break
      case 'accept': 
        this.handleAccept(from, message.payload)
        break
      case 'res':
        this.handleIOin(from, message.payload) 
        break
     case 'req':
        this.handleIOout(from, message.payload) 
        break
      default:
        this.warn(`ignored unhandeled message of type ${message.type} from ${from}`)
        break
    }
  }


  handleAnnouncement(from, announcement) {

    if(!announcement) {
      return
    }
    if(!announcement.id) {
      return
    }

    // is the announcement known? 
    if(this.receivedAnnouncements[announcement.id]) 
      return // early
    
    // store the announcement, in case a resource becomes free
    this.receivedAnnouncements[announcement.id] = {
      from: from
    }

    // check resources 
    if(this.resources == 0) 
      return // early 
      
    // what can we offer? 
    const offer = {
      re: announcement.id,
    //  prize: 0
    }

    this.receivedAnnouncements[announcement.id] = {
      from: from,
      offer: offer
    }

    // send offer to sender
    this.sendTo(from, new Message('offer', offer))

    // and then ;) 
    offer.listener = this.createOfferWatcher(announcement, offer)  
  }

  handleOffer(from, offer) {

    if(!offer) { 
      return 
    }
    if(!offer.re) {
      return
    }

    /*
     * add offer to set, inform announcement watcher
     */
    const a = this.announcements[offer.re]
    if(!a) {
      // suspicious sender
      return
    }

    if(!a.listener) {
      // internal error
      return
    }
    // inform the listener, i.e. the app about the new offer
    // the app can trigger accepts then
    a.listener(from, offer)
  }


  handleAccept(from, reply) {

    if(!reply) {
      return 
    }
    if(!reply.re) {
      return
    }

    const a = this.receivedAnnouncements[reply.re] 

    if(!a) {
      // suspicious sender
      return
    }
    if(!a.offer) {
      // did not send any offer??
      return
    }

    if(!a.offer.listener) {
      // suspicious
      return
    }
    a.offer.listener(from, reply)

  }

  handleIOin(from, reply) {

    if(!reply) {
      return 
    }
    if(!reply.re) {
      return
    }

    const a = this.announcements[reply.re] 

    if(a) {

      // TODO: are these offers really required? or is it better to provide a list of 
      // accepted offers .. 
      // callback and and 'reply' connector are sufficient on the controller side
      // TODO: security checks! 
      if(!a.offers) {
        return
      } else  if(!a.offers[from]) {
        return
      } else if(a.callback)  {
        // set up bi-com here by passing a reply channel to the callback
        if(!a.reply)
          a.reply = ((data) => {
            this.sendTo(from, new Message('req',{
              re: reply.re,
              data: data 
            }))
          }).bind(this) 
        a.callback(reply.error, reply.data, a.reply)
      }
    } 
  }
  
  handleIOout(from, reply) {

    if(!reply) {
      return 
    }
    if(!reply.re) {
      return
    }

    const a = this.receivedAnnouncements[reply.re] 

    if(a) {

      if(!a.offer) {
        // did not send any offer??
       return
      } else if(!a.offer.fulfillment) {
        // suspicious
        return
      } else {
        a.offer.fulfillment.send(reply.data) // deliver
      }

    }  
  }
  
  /**
   * announce 
   */
  announce(id, ann, fulfillment, cb) {

    const announcement = {
      id: (id?id: (this.id + '-' + Math.random())),
      payload: ann
    }

    this.announcements[announcement.id] = announcement

    this.log(`announcing ${announcement.id}`)
    this._broadcast(new Message('announcement', announcement).serialize()) 

    // fill in local slots
    announcement.offers = {} // TODO are offers on the controller side (framework) required?
    announcement.listener = this.createAnnouncementWatcher(announcement, {/*options*/}) 
    announcement.callback = cb // will be called with data and sender information
    announcement.fulfillment = fulfillment
  } 

  /** 
   * the function returned is called for each new offer on the announcement
   * it can decide who wins the pitch 
   */
  createAnnouncementWatcher(announcement, options) {
    return ((from, offer) => {
      /**
       * dummy, that accepts the first offer it gets
       */

       // TODO: are offers on the controller-side (framework) required?
      if(announcement.offers[from]) {
        // double offer
        return  
      }
      announcement.offers[from] = offer

      this.log(`received offer ${offer.re} from ${from}`)
      // immediately accept for now
      this.sendTo(from, new Message('accept', {
        re: offer.re,
        // additional information here
        fulfillment: announcement.fulfillment
      }) )
    }).bind(this)
  }

 /** 
   * the function returned is called for each reply to an offer.
   * the message may contain additional information about the 
   * fulfillment, i.e. actual work to do.
   */ 
  createOfferWatcher(announcement, offer, options) {
    // from is the sender, 
    // announcement the LOCAL instance of the initial announcement
    // reply the just received reply
    return ((from, reply) => {
      this.log(`offer ${offer.re} accepted by ${from} with reply ${JSON.stringify(reply)}`)
      // 
      if(!reply.fulfillment) {
        return
      }

      /**
       * javascript fulfillment request
       *
       * if the request is for a 'service', the webworker needs to support 
       * a special protocol, that allows to communicate via the 
       * announcement channel and with each node individually.  
       */
      if(reply.fulfillment.javascript) {
        try {

          offer.fulfillment = new JavascriptFulfillment(
            reply.re, 
            reply.fulfillment.javascript, 
            (m) => this.sendTo(from,m))

        } catch (e) {
          this.warn('Error during code execution',e)
        }
      }
    }).bind(this)
  }


  sendTo(to, message) {
    this.trace(`sending ${JSON.stringify(message)} to ${to}`)
    this._sendTo(to, message.serialize())
  }
}

/**
 * javascript fulfillment request
 * starts a webworker with the provided code (INSECURE) and
 * connects the workers messagins with the origin of the 
 * fulfillment request.
 * 
 * if the request is for a 'service', the webworker needs to support 
 * a special protocol, that allows to communicate via the 
 * announcement channel and with each node individually.  
 */
class JavascriptFulfillment {

    constructor(re, jscript, reply) {
      /*
       * INSECURE! 
       */
      const blobURL = window.URL.createObjectURL(new Blob([jscript]));

      console.warn(`creating INSECURE webworker with url ${blobURL}`)

      this.worker = new Worker(blobURL);

      // pass back messages
      this.worker.onmessage = function(e) {            
        reply(new Message('res', {
          re: re,              
          data: e.data
        }))
      }
      // pass back errors
      this.worker.onerror = function(error) {
        reply(new Message('res',{
          re: re,
          error: error.message
        }))
        throw error // rsp terminate this worker etc
      }
    }

    send(x) {
      this.worker.postMessage(x)
    }

}

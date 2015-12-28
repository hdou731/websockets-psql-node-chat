var express = require("express");
var app = express();
var crypto = require('crypto');
var http = require("http").Server(app);
var later = require('later');

var pg = require("pg");
var connString = "postgres://postgres@localhost/vulcun";

var sockjs = require("sockjs");
var wss = sockjs.createServer();

var bannedWords = null;


//
// ----------- WebSockets -------------------
//
var clients = {};
function broadcastMessage(fromUser, m) {
    for(var user in clients) {
        if (user == fromUser)
            continue;
        clients[user].write(JSON.stringify(m));
    }
}

// After thinking if I should offload this to the PostgreSQL server,
// I decided to keep it within the NodeJS server because the haystack
// would be what the PostgreSQL server would generate an index on and
// that's the dynamic one.
function containsBannedWord(haystack) {
    for(var i = 0; i < bannedWords.length; i++) {
        var word = bannedWords[i];
        if (haystack.indexOf(word) != -1)
            return true;
    }
    return false;
}

wss.on("connection", function(ws) {
    ws.on("data", function(data) {
        var parsed = JSON.parse(data);
        var username = parsed['username'];
        if (parsed['body'] == "!authenticate") {
            if( !(username in clients) ) {
                clients[username] = ws;
                parsed["username"] = "SYSTEM";
                parsed["body"] = username + " has just connected";
                broadcastMessage(username, parsed);
            }
            return;
        }
        // Filter based on bannedWords
        if (!containsBannedWord(parsed["body"]))
            broadcastMessage(username, parsed);
        else
            ws.write(JSON.stringify({ "username": "SYSTEM", 
                "body": "Banned word detected! Not going to broadcast message." }));
    });

    ws.on("close", function() {
        console.log("Client disconnected");
    });
});
wss.installHandlers(http, { prefix: "/chat" });

//
// ----------- Datastore  -------------------
//
var client = new pg.Client(connString);

function getUserCount(callback) {
    client.query("SELECT COUNT(*) FROM users", function(err, result) {
        if(err) { 
            // Callback takes twp args: err, result
            callback(err, null);
            return;
        }
        var parsed = parseInt(result.rows[0].count);
        callback(err, parsed);
    });
}

function getBannedWords(callback) {
    client.query("SELECT word FROM banned_words", callback);
}

function getBannedWordCount(callback) {
    client.query("SELECT COUNT(*) FROM banned_words", function(err, result) {
        if(err) { 
            // Callback takes twp args: err, result
            callback(err, null);
            return;
        }
        var parsed = parseInt(result.rows[0].count);
        callback(err, parsed);
    });
}

client.connect(function(err) {
    if (err)
        return console.error("Failed to connect to the persistent datastore.", err);
    console.log("Connected to the persistent datastore.");
    getBannedWords(function(err, result) {
        if (err) {
            console.error("Failed to fetch banned words. Running without filtering.");
            return;
        }
        var rows = result.rows;
        bannedWords = [];
        for (var i = 0; i < rows.length; i++)
            bannedWords.push(rows[i].word);
    });
});

//
// ----------- HTTP -------------------
//
app.get("/", function(req, res) {
    res.redirect("/index.html");
});

app.use("/index.html", express.static(__dirname + '/static/index.html'));

app.get("/admin/getUserCount", function(req, res) {
    getUserCount(function(err, result) {
        if(err) {
            res.write("Failed to run query");
            res.send(err);
            return;
        }
        res.send(result.toString());
    });
});

app.get("/admin/populateDatabase", function(req, res) {
  getUserCount(function(err, counter) { 
      if(err){
          res.send("Failed to get current user count");
          return;
      }
      var toGenerate = 10000000 - counter;
      var sendRoutine = function(err, result) {
          console.log(toGenerate);
          if(toGenerate <= 0)
              return;

          var amount = 10000;
          if(toGenerate < 10000)
              amount = toGenerate;

          client.query("INSERT INTO users (email, full_name, city) (SELECT r.e AS email, r.fn AS full_name, r.c AS city FROM(SELECT generate_series(1," + 
              amount.toString() + ") AS id, md5(random()::text) AS e, md5(random()::text) AS fn, md5(random()::text) AS c) AS r);", sendRoutine);

          toGenerate -= amount;
      };

      res.send("Generating " + toGenerate.toString() + "...");
      sendRoutine(null, null);
  });
});

app.get("/admin/populateBannedWords", function(req, res) {
  getBannedWordCount(function(err, counter) { 
      if(err){
          res.send("Failed to get current banned word count");
          return;
      }
      var toGenerate = 100 - counter;
      client.query("INSERT INTO banned_words(word) (SELECT r.a AS word FROM(SELECT generate_series(1," + 
          toGenerate.toString() + ") AS id, md5(random()::text) AS a) AS r);", 
          function() {
              res.send("OK");
      });

  });
});

http.listen(9000, function() {
    console.log("HTTP server initialized. Listening for connections...");
});


//
// ----------- Random ------------------
//
function randomSelect(howMany, chars) {
    // Default to set if chars is not defined.
    chars = chars || "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789 ";
    var rnd = crypto.randomBytes(howMany),
        value = new Array(howMany),
        len = chars.length;

    for (var i = 0; i < howMany; i++) {
        value[i] = chars[rnd[i] % len]
    };

    return value.join('');
}


//
// ----------- Chatter -------------------
//
later.setInterval(function() {
    for (var i = 0; i < 1000; i++) {
        var username = randomSelect(6);
        var message = { "username": username, "body": randomSelect(120) };
        broadcastMessage(username, message);
    }
}, later.parse.text("every 5 sec"));

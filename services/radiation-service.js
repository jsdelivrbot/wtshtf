'use strict';

module.exports = (function() {
  const https = require('https');
  var emailService = require('./email-service.js'),
      userService = require('./user-service.js'),
      radiationLevels = ['100', '200', '300', '500', '2000'],
      thresholdLevel = 3,
      radiatedPlaces = [ //yep, better make it an array.
        {
          name: "chernobyl",
          lng: 28.7917,
          lat: 51.2872,
          radius: 100
        }
      ];

  function distance(lat1, lon1, lat2, lon2) {
    var p = 0.017453292519943295;    // Math.PI / 180
    var c = Math.cos;
    var a = 0.5 - c((lat2 - lat1) * p)/2 +
            c(lat1 * p) * c(lat2 * p) *
            (1 - c((lon2 - lon1) * p))/2;

    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
  }

  function check() {
    try {
      console.log('radiation check start');
      https.get('https://redata.jrc.ec.europa.eu//gis/ogc/?Request=Execute&Service=WPS&Version=1.0.0&Language=en-EN&Identifier=HexBinGDRv4&RawDataOutput=dailyValues&DataInputs=bboxInput=-217.79296875000006,47.94929727697105,237.83203125000006,55.93761587980974,urn:ogc:def:crs:EPSG::4326;ZoomLevel=4;format=GeoJson;classification=classified;&_=1480846455686', (res) => {
        if (res.statusCode === 200) {
          var body = '';
          res.on('data', function(chunk) {
            body += chunk;
          });
          res.on('end', function() {
            var json = JSON.parse(body);
            for (let i=0; i<json.features.length; i++){
              let feature = json.features[i];
              //filter out all the stations within 100km of chernobyl because they are fucked
              let filterStation = false;
              feature.geometry.coordinates.forEach(function(coordList){
                coordList.forEach(function(coord){
                  radiatedPlaces.forEach(function(dangerZone){
                    if (distance(coord[0], coord[1], dangerZone.lng, dangerZone.lat) < dangerZone.radius){
                      filterStation = true;
                    }
                  });
                });
              });

              if (!filterStation){
                if (feature.properties.max > thresholdLevel){
                  userService.findVerified(function(err, users){
                      if (err){
                        throw `Unable to retrive list of users: ${err}`;
                      } else {
                        let emailArray = [];
                        users.forEach(function(user){
                          emailArray.push(user.email);
                        });
                        emailService.sendMail(emailArray, 'Gamma Radiation Alert', `The Gamma Radiation in at least one station surpasses ${radiationLevels[thresholdLevel]}nSv/hour.\n\nPlease check the following map for details:\nhttps://remap.jrc.ec.europa.eu/GammaDoseRates.aspx[[data-msys-clicktrack="0"]]\n\nUse the following link to unsubscribe:\nhttp://${process.env.HEROKU_APP_NAME}.herokuapp.com/registration/unsubscribe[[data-msys-clicktrack="0"]]`);
                      }
                  });
                  break;
                }
              }
            }
            console.log('radiation check end');
          });
        } else {
          throw `radiation endpoint returned ${res.statusCode}`;
        }
      }).on('error', (e) => {
        throw `error while querying radiation endpoint: ${e}`;
      });
    } catch (err){
      console.log(err);
      emailService.sendMail([process.env.DEFAULT_EMAIL], 'WTSHTF issue', err);
    }
  }
  return {
    check: check
  };
}());

var Promise = require('bluebird');
var _ = require('lodash');
var zon = require('aws-sdk');
var Busboy = require('busboy');

module.exports = function(config) {
  if(config){
    zon.config.update(config);
  } else {
    //perhaps sdk is configured through env variables
    config = {};
  }
  var s3 = new zon.S3();
  var mod, put = Promise.promisify(s3.putObject.bind(s3));

  mod = {
    write: function(opts, stream){
      var bucket = opts.bucket || config.bucket || process.env.s3_bucket 
      var key = opts.dir + '/' + opts.name;
      return put({
        Bucket: bucket,
        Key: key,
        Body: stream,
        ContentType: opts.mimetype,
        ACL: 'public-read',
      }).then(function(){
        return 'https://s3-us-west-2.amazonaws.com/'+bucket+'/'+key;
      });
    },
    fineupMware: function(opts){
      return function(req, res, next){
        var bb = new Busboy({headers: req.headers});
        var _file, _length, _opts;
        var write = function(){
          mod.write(_opts, _file).then(function(url){
            res.fileUrl = url;
            next();
          }, function(err){console.log(err); res.send(500, err)});
        }
        bb.on('file', function(fieldname, file, filename, encoding, mimetype){
          _opts = _.assign({name: filename, mimetype: mimetype}, opts)
          _file = file;
          if(_length){
            _file.length = _length;
            write();
          }
        });
        bb.on('field', function(name, val, val_truncated, name_truncated){
          if(name === 'qqtotalfilesize'){
            if(_file){
              _file.length = Number(val);
              write();
            } else { _length = Number(val);}
          }
        })
        req.pipe(bb);
      }
    },
    fineupRoute: function(opts){
      return function(req, res){
        mod.fineupMware(opts)(req, res, function(){
          res.set('Content-Type', 'text/plain'); //prevents download dialog on IE9
          res.send(200, {success: true, url: res.fileUrl});
        });
      }
    },
  }
}

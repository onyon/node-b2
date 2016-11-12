'use strict';

const _       = require("underscore");
const fs      = require("fs");
const https   = require("https");
const sha1    = require("sha1-file");
const async   = require("async");
const request = require("request");
const conf    = require("./conf.json");

/**
 * Require and object with accountId and applicationKey. apiUrl is third silent option for merge.
 **/
let b2 = function(object) {

  this.authorized = false;
  this.accountId = object.accountId;
  this.applicationKey = object.applicationKey;
  this.apiUrl = conf.apiUrl;

};

/**
 * Retrieve an authentication token, assign it to this.
 **/
b2.prototype.authorize = function(callback) {

  // Setup Request (basic authentication)
  let options = {
    url: this.apiUrl + "/b2_authorize_account",
    method: "GET",
    json: true,
    auth: {
      user: this.accountId,
      pass: this.applicationKey
    }
  };

  // Create call, if status = 200, then we will assign body variables.
  request(options, (err, resp, body) => {

    // Invalid response
    if(err || resp.statusCode !== 200)
      try { callback(b2Error(resp), {}); } finally { return; }

    // Set return data
    this.authorized         = true;
    this.apiUrl             = body.apiUrl;
    this.authorizationToken = body.authorizationToken;
    this.downloadUrl        = body.downloadUrl;
    this.minimumPartSize    = body.minimumPartSize;

    // Set default data for future calls, change scope of request
    this.request = request.defaults({
      baseUrl: this.apiUrl + "/b2api/v1/",
      method: "GET",
      json: true,
      headers: {
        "Authorization": this.authorizationToken
      }
    });

    // Return to parent
    try { callback(null, body); } catch(e) {}

  });

};

/**
 * Retrieve a list of buckets in the account, return an array.
 * @return bucketId
 **/
b2.prototype.listBuckets = function(callback) {

  // Make call
  this.request.get("/b2_list_buckets?accountId=" + this.accountId, (err, resp, body) => {

    if(err || resp.statusCode !== 200)
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Create a new bucket
 **/
b2.prototype.createBucket = function(data, callback) {

  // Prefix data
  let formData = { accountId: this.accountId, bucketName: data.bucketName, bucketType: "allPrivate" };
  if("bucketType" in data)
    formData.bucketType = data.bucketType;

  // Make call
  this.request.post({ url: "/b2_create_bucket", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200)
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Retrieve a list of files in a bucket, return an array.
 **/
b2.prototype.listFileNames = function(data, callback) {

  // Prefix data, bucketId required, pagination not.
  let formData = { bucketId: data.bucketId };

  // Optional
  if("startFileName" in data)
    formData.startFileName = data.startFileName;
  if("maxFileCount" in data)
    formData.maxFileCount = data.maxFileCount;
  if("depth" in data)
    formData.depth = data.depth;

  // Make call
  this.request.post({ url: "/b2_list_file_names", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200) 
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Retrieve a list of file versions.
 **/
b2.prototype.listFileVersions = function(data, callback) {

  // Prefix data.
  let formData = { bucketId: data.bucketId };
 
  // Optional
  if("startFileName" in data)
    formData.startFileName = data.startFileName;
  if("startFileId" in data)
    formData.startFileId = data.startFileId;
  if("maxFileCount" in data)
    formData.maxFileCount = data.maxFileCount;

  // Make call
  this.request.post({ url: "/b2_list_file_versions", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200)
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Delete a file version.
 **/
b2.prototype.deleteFileVersions = function(data, callback) {

  // Validate Input
  if(!("fileName" in data) || !("fileId" in data))
    return callback(new Error("Missing required input. { fileName, fileId }"), {});

  // Prefix data
  let formData = { fileName: data.fileName, fileId: data.fileId };

  // Make Call
  this.request.post({ url: "/b2_delete_file_version", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200) 
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Create an upload URL for a file.
 * @return (string) The URL to post the file to.
 **/
b2.prototype.getUploadUrl = function(bucketId, callback) {

  // POST the bucketId into the request
  let formData = { bucketId: bucketId };

  // Make call
  this.request.post({ url: "/b2_get_upload_url", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200)
      return callback(b2Error(resp), {}); 

    callback(null, body);

  });

};

/**
 * Upload a file.
 * Object Details
 * - file: Path of file on disk.
 * - fileName: (optional) UTF8 encoded name of file.
 * - contentType: (optional) b2/x-auto for automatic encoding.
 **/
b2.prototype.uploadFile = function(data, callback) {

  // Scope
  let cb = callback;
  let self = this;

  // Automatic retry, default is 3 attempts.
  let retryAttempts = ("retry" in data) && (new Number).isInteger(data.retry)?data.retry:3;

  // Run the following actions in parallel.
  // 1) Get an upload URL from B2
  // 2) Get the SHA1 of the file we are uploading.
  // 3) Prepare a readStream for upload.
  // CB) Upload the file
  async.parallel([
  function(callback) {

    self.getUploadUrl(data.bucketId, (err, resp) => {

      data.endpoint = resp;
      callback(null, true);

    });

  },
  function(callback) {

    sha1(data.file, (err, sum) => {
      data.sha1 = sum;
      callback(null, true);
    });

  },
  function(callback) {

    fs.stat(data.file, (err, stat) => {
      data.stat = stat;
      data.readStream = fs.createReadStream(data.file);
      callback(null, true); 
    });

  }
  // Parallel callback
  ], function(err, res) {

    // We are no longer using the default request object we've created, since this is not the API endpoint,
    // but an endpoint specifically for uploading data. 
    let options = {
      url: data.endpoint.uploadUrl,
      body: data.readStream,
      headers: {
        "Authorization": data.endpoint.authorizationToken,
        "Content-Type": (("contentType" in data)?data.contentType:"b2/x-auto"),
        "Content-Length": data.stat.size,
        "X-Bz-File-Name": data.fileName,
        "X-Bz-Content-Sha1": data.sha1
      }
    };

    // Method to post file to B2
    let postFile = function(callback) {

      request.post(options, (err, resp, body) => {

        if(err || resp.statusCode !== 200)
          return callback(b2Error(resp), {});

        return callback(null, JSON.parse(body));

      });

    };

    // Wrap it so if it fails (often a 503 busy) that it automatically attempts another upload
    // with an exponential backoff. Then callback to invoker.
    async.retry({
      times: retryAttempts, 
      interval: function(retryCount) {
        return 50 * Math.pow(2, retryCount);
      }
    }, postFile, cb);

  });

};

/**
 * Delete all versions of a file.
 **/
b2.prototype.deleteFile = function(data, callback) {

};

/**
 * Return a read stream for file.
 **/
b2.prototype.getFileStream = function(data, callback) {

  // Create file URL
  let reqData = {
    method: "GET",
    host: this.downloadUrl.substring(8), // Remove HTTPS:// prefix
    path: "/file/" + data.bucketName + "/" + data.fileName,
    headers: {
      "Authorization": this.authorizationToken
  }};

  return https.get(reqData, callback);

};

/**
 * Download a file locally.
 **/
b2.prototype.downloadFile = function(data, callback) {

  // Validate Input
  if(!("bucketName" in data) || !("fileName" in data) || !("file" in data))
    return callback(new Error("Missing required data. { bucketName, fileName, file }"), {});

  // Get File Pipe
  var stream = this.getFileStream(data, (resp) => {

    // Write file to disk
    resp.pipe(fs.createWriteStream(data.file, { flags: "w+" }));

    // Cleanup
    resp.on("end", () => {

      // Do we want to verify sha1 of file
      if(("verify" in data) && data.verify === true) {

        // Get the SHA1
        sha1(data.file, (err, sum) => {

          // Error getting sha1
          if(err)
            return callback(err, resp);
          
          // SHA1 sum mismatch error
          if(sum !== resp.headers["x-bz-content-sha1"])
            return callback(new Error("SHA1 sum mismatch."), resp);

          return callback(null, resp);

        });

      } else 
        return callback(null, resp);

    });

  });
  // Error Connecting
  stream.on("error", (err) => {
    callback(b2Error(stream), {});
  });

};

/**
 * Get file info.
 **/
b2.prototype.getFileInfo = function(fileId, callback) {

  // Prefix data
  let formData = { fileId: fileId };

  // Make call
  this.request.post({ url: "/b2_get_file_info", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200)
      return callback(b2Error(resp), {});

    callback(null, body);

  });

};

/**
 * Get authorization token
 **/
b2.prototype.getAuthToken = function(data, callback) {

  // Validate input
  if(!("bucketId" in data) || !("fileNamePrefix" in data) || !("duration" in data))
    return callback(new Error("Missing required data. { bucketId, fileNamePrefix, duration }"), null);

  // Prefix data
  let formData = { 
    bucketId: data.bucketId,
    fileNamePrefix: data.fileNamePrefix,
    validDurationInSeconds: data.duration
  };

  // Make call
  this.request.post({ url: "/b2_get_download_authorization", form: JSON.stringify(formData) }, (err, resp, body) => {

    if(err || resp.statusCode !== 200) 
      return callback(b2Error(resp), {});

    callback(null, body.authorizationToken);

  });

};

/**
 * Create an error object based on API results.
 * http.requestObject
 **/
let b2Error = function(data) {

  let err = function(data) {

    // Attempt to grab the error from the request. If we don't validate this as a proper API return
    // from backblaze, then we will provide a generic error return instead. (DNS error, unplugged
    // network cable, backblaze down, etc)
    try {

      if(!("body" in data) || typeof(data.body) !== "object")
        throw "Request body did not return as an object.";

      this.api = data.body;

    } catch(e) {

      this.api = { status: 0, code: "application_error", message: "Error connection to B2 service." };

    // Assign the other bits.
    } finally {

      this.requestObject = data;
      this.status  = this.api.status;
      this.code    = this.api.code;
      this.message = this.api.message;

    }

  };

  // Assign our function to error & return.
  err.prototype = Error.prototype;
  return new err(data);

};

/**
 * Alias to getAuthToken
 **/
b2.prototype.getAuthorizationToken = b2.prototype.getAuthToken;

module.exports = b2;

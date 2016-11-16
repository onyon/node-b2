# Interface to BackBlaze B2

This is an interface into the BackBlaze B2 API with a series of helper functions that will allow you to shortcut some calls.

### Install

```bash
npm install node-backblaze-b2
```

### Setup

```javascript
const backblaze = require("node-backblaze-b2");
let b2 = new backblaze({ accountId: "string", applicationKey: "string" });
```

#### Authorize ([b2_authorize_account](https://www.backblaze.com/b2/docs/b2_authorize_account.html))

**Must be done first before anything else.** This will return an Authorization token. The token is also stored within the application so you don't need to explicitly do anything with it going forward.
```javascript
b2.authorize((err, data) => {});
```

#### List Buckets ([b2_list_buckets](https://www.backblaze.com/b2/docs/b2_list_buckets.html))

Return a list of buckets associated with the account. You can optionally pass in a string which will only return that specific bucket's object.

**List all buckets**
```javascript
b2.listBuckets((err, data) => {});
```
**List individual bucket**
```javascript
b2.listBuckets("my-bucket", (err, data) => {});
```

#### Create Bucket ([b2_create_bucket](https://www.backblaze.com/b2/docs/b2_create_bucket.html))

Creates a new bucket and returns the associated bucket object.
```javascript
let input = {
  bucketName: "string",
  bucketType: "allPublic" // Also accepts allPrivate.
};
b2.createBucket(input, (err, data) => {});
```

#### List File Names in Bucket ([b2_list_file_names](https://www.backblaze.com/b2/docs/b2_list_file_names.html))

Returns an array with file names that exist in a bucket. This has a maximum of 1000 items returned, and if nextFileName exist within the response, you will need to re-request with the startFileName filter to get the next set of data.
```javascript
let input = {
  bucketId: "string",
  startFileName: "string", // Optional
  maxFileCount: int, // Optional
  depth: int // Folder depth in which to scan
};
b2.listFileNames(input, (err, data) => {});
```

#### List File Versions in Bucket ([b2_list_file_versions](https://www.backblaze.com/b2/docs/b2_list_file_versions.html))

Returns an array with file versions that exist in a bucket. This has a maximum of 1000 items returned, and if nextFileName/nextFileId exist within the response, you will need to re-request with the startFileName/startFileId filter to get the next set of data.
```javascript
let input = {
  bucketId: "string",
  startFileName: "string", // Optional
  startFileId: "string", // Optional
  maxFileCount: int // Optional
  strict: bool, // Optional. When used with startFileName, it will only return results with the exact filename.
};
b2.listFileVersions(input, (err, data) => {});
```

#### Get File Info ([b2_get_file_info](https://www.backblaze.com/b2/docs/b2_get_file_info.html))

Return an object of file details. It needs either fileId, or fileName to be passed. If fileName is passed in, it will automatically find the fileId of the latest version of the file, as returned in b2.listFileVersions.

```javascript
let input = { fileId: "string" };  // Get file info by ID (1 API call)
let input = { fileName: "string", bucketId: "string" }; // Get file info by Name and Bucket ID (2 API calls)
let input = { fileName: "string", bucketName: "string" }; // Get file info by Name and Bucket Name (3 API calls)
b2.getFileInfo(input, (err, data) => {});
```

#### Delete File ([b2_delete_file_version](https://www.backblaze.com/b2/docs/b2_delete_file_version.html))

Delete a file. This requires both the fileName and fileId to be passed into it. It will only delete the fileId specified, so if there are multiple versions of the file, you'll need to delete each one.

```javascript
let input = { fileId: "string", fileName: "string" };
b2.deleteFile(input, (err) => {});
```

#### Get Upload URL ([b2_get_upload_url](https://www.backblaze.com/b2/docs/b2_get_upload_url.html))

Return an upload url object. Use this is you plan to upload a file manually, if you use the b2.uploadFile function, then this is called on your behalf.

```javascript
let input = {
  bucketId: "string"
};
b2.getUploadUrl(input, (err, data) => {});
```

#### Upload a file to B2 ([b2_upload_file](https://www.backblaze.com/b2/docs/b2_upload_file.html))

Upload a local file to B2, and return the file objects. This will perform all necessary helper data on your behalf. The ability to add header data will come at a future date.

```javascript
let input = {
  bucketId: "string",
  file: "/path/to/file.jpg",
  fileName: "filename/on/b2.jpg",
  contentType: "image/jpeg", // Optional, mime type to use.
  retryAttempts: 3  // Optional, how many attempts at an upload. This compensates for the B2 503 on upload.
};
b2.uploadFile(input, (err, data) => {});
```

#### Get Authorization Token ([b2_get_download_authorization](https://www.backblaze.com/b2/docs/b2_get_download_authorization.html))

Retrieve an authorization token that will allow you to download a file directly from B2.

```javascript
let input = {
  bucketId: "string",
  fileNamePrefix: "/path", // This would allow /path.jpg, /path/file.jpg, etc.
  duration: int // Seconds that this token should remain valid.
};
b2.getAuthToken(input, (err, data) => {});
```

#### Save File Locally ([b2_download_file_by_name](https://www.backblaze.com/b2/docs/b2_download_file_by_name.html))

Retrieve a file from B2 and save it to local disk. If the file already exists, it will attempt to truncate the file and write it again. Returns the finished http.ClientRequest object.

```javascript
let input = {
  bucketName: "string",
  fileName: "filename/on/b2.jpg",
  file: "/path/to/file.jpg",
  verify: false // Optional, Verify sha1 matches the one sent by b2.
};
b2.downloadFile(input, (err, data) => {});
```

#### Retrieve File as http(s).ClientRequest Object ([b2_download_file_by_name](https://www.backblaze.com/b2/docs/b2_download_file_by_name.html))

Retrieve an [https.ClientRequest](https://nodejs.org/api/http.html#http_class_http_clientrequest) object for minipulation. This allows to modify and object retrieved from B2 without needing to write it to disk first.

```javascript
let input = {
  bucketName: "string",
  fileName: "string"
};
var stream = b2.getFileStream(input, (resp) => {

  // Retrieve data in chunks
  resp.on("data", (chunk) => {
    console.log(chunk); // Buffer.
  });

  // Write file to disk.
  resp.pipe(fs.createWriteStream("./myData.ext", { flags: "w+" }));

});
// Error downloading object.
stream.on("error", (err) => {
  console.log(err);
});
```

#### Error Object
If any API calls return an error, the callback will return a modified [Error Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error). The following data is an  example of an unable to authenticate error. All errors follow this standard form, with the exception of **err.status = 0 represents a local application error, or inability to contact B2 API**. 
```javascript
let err = {
  api: {  // This was left in here to allow BackBlaze to update their error response object in the future.
    code: 'bad_auth_token',
    message: 'Invalid authorization token',
    status: 401
  },
  code: 'bad_auth_token',
  status: 401,
  message: 'Invalid authorization token',
  requestObject: { [http.clientRequest() object] }
};
```


**Please report bugs and feature requests to [Github](https://github.com/cebollia/node-b2/issues).**


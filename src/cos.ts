import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as url from 'url'
import * as crypto from 'crypto'
import * as moment from 'moment'
const COS = require('cos-nodejs-sdk-v5')

let cos: any = null

const initInstance = (config: vscode.WorkspaceConfiguration) => {
    cos = new COS({
        SecretId: config.secretId,
        SecretKey: config.secretKey,

    })
    return cos
}

const getMD5 = (imagePath: string) => {
    return new Promise((resolve, reject) => {
        var rs = fs.createReadStream(imagePath);
        var hash = crypto.createHash('md5');
        rs.on('data', hash.update.bind(hash));
        rs.on('end', function () {
          resolve(hash.digest('hex'));
        });
        rs.on('error', function(err) {
            reject(err);
        });
    });
}

export default function (config: vscode.WorkspaceConfiguration, imagePath: string, selectFilePath?: string) {
    let localFile = selectFilePath || imagePath,
        bucket = config.bucket,
        region = config.region,
        domain = config.domain


    if (domain && /^http(s)?\:\/\/(.+)/.test(domain)) {
        domain = domain.replace(/^http(s)?\:\/\//, '')
    }

    if (/^".+"$/.test(localFile)) {
        localFile = imagePath.substring(1, imagePath.length - 1)
    }

    return new Promise((resolve, reject) => {
        getMD5(localFile)
            .then((md5) => {
                const extname = path.extname(localFile);
                const remoteFile = path.join(config.remotePath, `${moment().format('YYYYMMDDHHmmss')}_${md5}${extname}`).replace(/\\/g, '/')
                cos = cos || initInstance(config)

                cos.putObject({
                    Bucket: bucket,
                    Region: region,
                    Key: remoteFile,
                    Body: fs.readFileSync(path.resolve(__dirname, localFile))
                }, (err: any, data: any) => {

                    if (err) {
                        return reject(err)
                    } 

                    // delete temp file
                    if (!localFile) {
                        fs.unlink(imagePath, err => {
                            console.log("Failed to delete the temp image.")
                        })
                    }

                    let url = cos.getObjectUrl({
                        Bucket: bucket,
                        Region: region,
                        Key: remoteFile,
                        Sign: !config.isPublic,
                        Expires: config.duration
                    })
                    console.log(url)
                    if (domain) {
                        url = url.replace(/[^\/]+\.cos\..+\.myqcloud.com/, domain)
                    }

                    resolve({
                        name: remoteFile,
                        url: url
                    })
                })
            })
            .catch((err) => {
                reject(err)
            })
    })
}
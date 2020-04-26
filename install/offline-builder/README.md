# Offline installation

To install MyCloud in an environement without internet access, you need to download all packages upfront into a folder using the provided scripts.
Once you have done this, copy the mycloud repo base directory over to the offline machine that will host the controll plane.

> The scripts are only valide for RedHat & CentOS 7 & 8 at the moment

# TODO

PM2 NPM offline using 

```
npm install -g npm-bundle
```

Resolve host-node dep with `npm i` before copying folder to offline machine

On Kubernetes cluster create for WS, import images rather than pulling them

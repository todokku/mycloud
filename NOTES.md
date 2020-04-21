# K8S tools

## Istio

```
mc cluster:extend istio
```

1. Make sure knative has not been installed (ns: knative-serving)
2. Make sure istio has not been installed (ns: istio-system)
3. Install istio CLI on master VM:
   1. curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.5.1 sh -
   2. cd istio-1.5.1 && export PATH=$PWD/bin:$PATH
   3. istioctl manifest apply --set profile=default

```
mc ns:istio <namespace> --sidecar=automatic
```

1. Make sure istio is installed (with or without knative)


## Knative

```
mc cluster:extend knative
```

1. Make sure knative has not been installed (ns: knative-serving)
2. Make sure istio has not been installed (ns: istio-system)
3. Install knative compatible istio version
4. Install knative serving and eventing







# Set up RBAC, Keycloak and OpenID Connect

> The bootastap script already installes Keycloak and the NGinx certificate  
> On control plane VM, on each K8S Master cluster && on each end user environement, add keycload hosts entry:

```
echo "<KEYCLOAK_IP> mycloud.keycloak.com" >> /etc/hosts
```

## In keycloak UI

1. Add client: `kubernetes-cluster`, set `validate redirect uri`to `*`.
2. Add users with a valide email address, and enable `Email Verified` on it

## On each new K8S cluster

Grab the root certificate of the Keycloak Nginx certificate:

```
sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@192.168.0.97:/opt/docker/containers/nginx/certs/rootCA.crt /etc/kubernetes/pki/rootCA.crt
```

We need also to add some parameters on the API Server config:

Edit file `/etc/kubernetes/manifests/kube-apiserver.yaml`, and add:

```
    - --oidc-issuer-url=https://mycloud.keycloak.com/auth/realms/master
    - --oidc-username-claim=email
    - --oidc-client-id=kubernetes-cluster
    - --oidc-ca-file=/etc/kubernetes/pki/rootCA.crt
```

## On the client side that wants to use kubectl

> Install krew plugin manager for kubectl, guides are here: https://krew.sigs.k8s.io/docs/user-guide/setup/install/

Then install oidc-login:

```
kubectl krew install oidc-login
```

Edit file: `~/.kube/config-<acc name>-<org name>-<ws name>`

```
apiVersion: v1
clusters:
  - cluster:
      certificate-authority-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUN5RENDQWJDZ0F3SUJB$
      server: https://192.168.0.248:6443
    name: <acc name>-<org name>-<ws name>-cluster
contexts:
  - context:
      cluster: <acc name>-<org name>-<ws name>-cluster
      user: <user email>
    name: <acc name>-<org name>-<ws name>
current-context: <user email>
kind: Config
preferences: {}
users:
  - name: <user email>
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: kubectl
        args:
        - oidc-login
        - get-token
        - --oidc-issuer-url=https://mycloud.keycloak.com/auth/realms/master
        - --oidc-client-id=kubernetes-cluster
        - --insecure-skip-tls-verify=true
        - --oidc-redirect-url-hostname=127.0.0.1
        - --listen-address=127.0.0.1:12345
```




# Keycloac API calls

## Create role

``` bash
ROLE_NAME=org_admin

KK_TOKEN=$(curl -k -X POST \
    'https://mycloud.keycloak.com/auth/realms/master/protocol/openid-connect/token' \
    -H "Content-Type: application/x-www-form-urlencoded"  \
    -d "grant_type=client_credentials" \
    -d "client_id=master-realm" \
    -d "client_secret=02c33646-c040-4db0-b333-7a8b2d047588" \
    -d "username=admin"  \
    -d "password=keycloakpass" \
    -d "scope=openid" | jq -r '.access_token')

CLIENT_UUID=$(curl -k --request GET \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    https://mycloud.keycloak.com/auth/admin/realms/master/clients?clientId=kubernetes-cluster | jq '.[0].id' | sed 's/[\"]//g')

curl -k --request POST \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    --data '{"clientRole": true,"name": "'"$ROLE_NAME"'"}' \
    https://mycloud.keycloak.com/auth/admin/realms/master/clients/$CLIENT_UUID/roles
```




## Create user and assign role

``` bash
USER_NAME=foouser
USER_EMAIL=foouser@gmail.com
ROLE_NAME=org_admin

KK_TOKEN=$(curl -k -X POST \
    'https://mycloud.keycloak.com/auth/realms/master/protocol/openid-connect/token' \
    -H "Content-Type: application/x-www-form-urlencoded"  \
    -d "grant_type=client_credentials" \
    -d "client_id=master-realm" \
    -d "client_secret=02c33646-c040-4db0-b333-7a8b2d047588" \
    -d "username=admin"  \
    -d "password=keycloakpass" \
    -d "scope=openid" | jq -r '.access_token')

curl -k --request POST \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    --data '{ "username": "'"$USER_NAME"'", "lastName": "test", "firstName": "joe", "email": "'"$USER_EMAIL"'", "enabled": true, "credentials":[{ "type": "password", "value": "test", "temporary": false }]}'
    https://mycloud.keycloak.com/auth/admin/realms/master/users

curl -k --request GET \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    https://mycloud.keycloak.com/auth/admin/realms/master/users?email=$USER_EMAIL | jq select(.email == "$USER_EMAIL")

U_ID=$(curl -k --request GET \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    https://mycloud.keycloak.com/auth/admin/realms/master/users?email=$USER_EMAIL | jq '.[0].id' | sed 's/[\"]//g')

CLIENT_UUID=$(curl -k --request GET \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    https://mycloud.keycloak.com/auth/admin/realms/master/clients?clientId=kubernetes-cluster | jq '.[0].id' | sed 's/[\"]//g')

ROLE_UUID=$(curl -k --request GET \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    https://mycloud.keycloak.com/auth/admin/realms/master/clients/$CLIENT_UUID/roles/$ROLE_NAME | jq '.id' | sed 's/[\"]//g')

curl -k --request POST \
    -H "Accept: application/json" \
    -H "Content-Type:application/json" \
    -H "Authorization: Bearer $KK_TOKEN" \
    --data '[{"name": "foobar", "id": "'"$ROLE_UUID"'"}]' \
    https://mycloud.keycloak.com/auth/admin/realms/master/users/$U_ID/role-mappings/clients/$CLIENT_UUID
```
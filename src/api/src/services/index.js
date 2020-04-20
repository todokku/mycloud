const users = require('./users/users.service.js');
const accounts = require('./accounts/accounts.service.js');
const organizations = require('./organizations/organizations.service.js');
const workspaces = require('./workspaces/workspaces.service.js');
const orgUsers = require('./org-users/org-users.service.js');
const cli = require('./cli/cli.service.js');
const k8sNodes = require('./k8s_nodes/k8s_nodes.service.js');
const k8sHosts = require('./k8s_hosts/k8s_hosts.service.js');
const tasks = require('./tasks/tasks.service.js');
const volumes = require('./volumes/volumes.service.js');
const glusterVolReplicas = require('./gluster_vol_replicas/gluster_vol_replicas.service.js');
const glusterHosts = require('./gluster_hosts/gluster_hosts.service.js');
const volume_bindings = require('./volume_bindings/volume_bindings.service.js');
const services = require('./services/services.service.js');
const certificates = require('./certificates/certificates.service.js');
const domains = require('./domains/domains.service.js');
const applications = require('./applications/applications.service.js');
const routes = require('./routes/routes.service.js');
const settings = require('./settings/settings.service.js');
// eslint-disable-next-line no-unused-vars
module.exports = function (app) {
  app.configure(accounts);
  app.configure(users);
  app.configure(organizations);
  app.configure(workspaces);
  app.configure(orgUsers);
  app.configure(cli);
  app.configure(k8sNodes);
  app.configure(k8sHosts);
  app.configure(tasks);
  app.configure(volumes);
  app.configure(glusterVolReplicas);
  app.configure(glusterHosts);
  app.configure(volume_bindings);
  app.configure(services);
  app.configure(certificates);
  app.configure(domains);
  app.configure(applications);
  app.configure(routes);
  app.configure(settings);
};

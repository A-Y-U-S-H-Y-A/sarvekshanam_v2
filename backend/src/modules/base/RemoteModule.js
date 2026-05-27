'use strict';

const BaseModule = require('./BaseModule');

/**
 * RemoteModule
 * 
 * Acts as a proxy module bridging the local BaseModule interface to a Remote Edge Runner.
 * The inner structure mimics a local module exactly, allowing seamless execution.
 */
class RemoteModule extends BaseModule {
  /**
   * @param {object} runner - The remote host info (id, name, etc.)
   * @param {object} moduleData - The module payload from the runner (name, description, params)
   */
  constructor(runner, moduleData) {
    super();
    this.runnerId = runner.id;
    this.runnerName = runner.name;
    this.remoteModuleId = moduleData.id;
    
    // Convert remote parameter formats if needed.
    // If the remote already provides { name, type, required, description }, we pass it along.
    this._meta = {
      id: `remote_${runner.id}_${moduleData.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      name: `[${runner.name}] ${moduleData.name}`,
      description: moduleData.description || `Remote module executed on ${runner.name}`,
      category: `Remote / ${runner.name}`, // Create a distinct structural category per runner
      parameters: moduleData.parameters || []
    };

    // Ensure 'target' parameter exists since PowerUser frontend strictly requires it
    if (!this._meta.parameters.some(p => p.name === 'target')) {
      this._meta.parameters.unshift({
        name: 'target',
        type: 'string',
        required: true,
        description: 'Target IP, hostname, or URL'
      });
    }
  }

  get meta() {
    return this._meta;
  }

  async run(params, options = {}) {
    const { getRunnerService } = require('../../services/runnerService');
    const runnerService = getRunnerService();
    try {
      let args = [];
      for (const p of this._meta.parameters) {
        if (params[p.name] !== undefined && params[p.name] !== null) {
          args.push(String(params[p.name]));
        } else {
          args.push('');
        }
      }

      const res = await runnerService.runModuleOnHost(this.runnerId, this.remoteModuleId, args, options.onEvent);
      
      // If the module returned a failed struct
      if (res && res.status === 'error') {
        return this._result('error', res.error || 'Remote error', res);
      }

      // Extract Go's stdout gracefully. If the python script returned JSON, parse it beautifully.
      let parsedOutput = res;
      if (res.stdout) {
        try {
          // If the underlying module stdout is JSON, unpack it so it renders natively!
          const innerJson = JSON.parse(res.stdout);
          parsedOutput = innerJson;
        } catch(e) {
          parsedOutput = res.stdout;
        }
      }

      // If the underlying python script threw an error status internally
      if (parsedOutput.status === 'error') {
        return this._result('error', parsedOutput.error || parsedOutput.output || 'Module reported an error', parsedOutput);
      }

      const outputStr = typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput, null, 2);
      
      return this._result('success', outputStr, res);
    } catch (err) {
      return this._result('error', err.message);
    }
  }
}

module.exports = RemoteModule;

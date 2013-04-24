(function(module, global) {

  var math = require("./mathlib");

  /**
   * Warped K-Means: an algorithm to cluster sequentially-distributed data.
   * Luis A. Leiva and Enrique Vidal. Information Sciences, 2013.
   * See http://dx.doi.org/10.1016/j.ins.2013.02.042
   * @author Luis A. Leiva
   * @license Dual licensed under the MIT and LGPL licenses.
   * @see Project page: http://personales.upv.es/luileito/wkm/
   */
  var WKM = function(samples, numclusters, threshold) {
    // Instantiates the class.
    // Threshold is the cluster population that will be tested in each iteration.
    this.maxiter = 100;
    // User input
    this.samples     = samples;
    this.numclusters = parseInt(numclusters);
    this.threshold   = parseFloat(threshold) || 0;
    // Assume that all samples have the same dimensions
    this.dimensions = samples[0].length;
    // Sanitize user input
    if (this.numclusters < 1) {
      this.numclusters = 1;
    } else if (this.numclusters > samples.length) {
      this.numclusters = samples.length;
    }
    if (threshold > 1) {
      this.threshold = 1;
    } else if (threshold < 0) {
      this.threshold = 0;
    }
    this.reset();
  };

  /**
   * Clean up.
   * @return void
   */
  WKM.prototype.reset = function() {
    this.initialized  = false;
    // System ouput
    this.boundaries   = [];
    this.clusters     = [];
    this.centroids    = [];
    this.localenergy  = [];
    for (var j = 0; j < this.numclusters; j++) {
      this.boundaries.push(0);
      this.clusters.push(0);
      this.centroids.push(0);
      this.localenergy.push(0);
    }
    this.totalenergy  = 0; // FIXME: actually it can be computed as array sum of localenergy
    this.iterations   = 0;
    this.numtransfers = 0;
    this.cost         = 0;
  };

  /**
   * Initialization, optionally using a given method.
   * @param method String "ts" or "eq"
   * @return void
   */
  WKM.prototype.init = function(method) {
    this.reset();
    var N = this.samples.length, M = this.numclusters;
    // Silly checks
    if (this.numclusters <= 1) { // single partition
      this.boundaries = [0];
      return;
    } else if (this.numclusters >= N) { // singleton clusters
      for (var i = 0; i < M; i++) {
        this.boundaries[i] = i;
      }
      return;
    }
    // Finally check user-defined method
    if (typeof method === 'undefined') {
      this.initdefault(N,M);
    } else {
      var m = method.toLowerCase();
      if (m == "ts") {
        this.TS(N,M);
      } else if (m == "eq") {
        this.resample(N,M);
      } else {
        this.initdefault(N,M);
      }
    }
  };

  /**
   * Default boundaries initialization. 
   * Will use TS only if 2M <= N (~ Nyquist).
   * Other methods may be implemented, as long as they process samples in a sequential fashion.
   * @param N Number Number of samples
   * @param M Number Number of clusters
   * @return void
   */
  WKM.prototype.initdefault = function(N, M) {
    this.boundaries = [];
    if (N/M < 2) {
      this.resample(N,M);
    } else {
      this.TS(N,M);
    }
    this.resample(N,M)
  };

  /**
   * Initialize boundaries by trace segmentation (non-linear allocation). 
   * @param N Number Number of samples
   * @param M Number Number of clusters
   * @return void
   */
  WKM.prototype.TS = function(N, M) {
    this.boundaries = [];
    var ret = math.cumdist(this.samples),
        Lcum = ret.values, 
        LN   = ret.length,
        incr = LN/M, 
        i = 0;
    for (var j = 1; j < M+1; j++) {
      var fact = (j - 1)*incr;
      while (fact > Lcum[i] || this.boundaries.indexOf(i) > -1) {
        i++;
      }
      this.boundaries.push(i);
    }
    this.initialized = true;
  };
  
  /**
   * Allocate N points into M boundaries in a linear fashion.
   * @param N Number Number of samples
   * @param M Number Number of clusters
   * @return void
   */
  WKM.prototype.resample = function(N, M) {
    this.boundaries = [];
    var b = -1;
    for (var i = 0; i < N; i++) {
      var q = Math.floor( (i+1)*M/(N+1) );
      if (q > b) {
        b = q;
        this.boundaries.push(i);
      }
    }
    this.initialized = true;
  };      

  /** 
   * Assign points to a cluster in a sequential fashion.
   * @return void
   */
  WKM.prototype.getPartition = function() {
    for (var j = 0; j < this.numclusters; j++) {
      this.clusters[j] = this.getClusterSamples(j);
      if (this.clusters[j].length === 0) {
        throw "Empty cluster " + j;
      }
    }
  };

  /** 
   * Retrieve points by cluster index.
   * @param index Number Cluster index
   * @return Cluster samples
   */
  WKM.prototype.getClusterSamples = function(index) {
    var l = index+1 < this.numclusters ? this.boundaries[index+1] : this.samples.length;
    return this.samples.slice(this.boundaries[index], l);
  };

  /** 
   * Specify a sequential cluster configuration.
   * @param partition Array Cluster
   * @return void
   */
  WKM.prototype.setPartition = function(partition) {
    this.boundaries = [0];
    this.clusters = [];
    for (var j = 0; j < partition.length; j++) {
      var points = partition[j];
      if (points.length === 0) {
        throw "Empty cluster " + j;
      }
      this.clusters[j] = points.slice();
      if (j > 0) {
        this.boundaries.push(points.length - 1);
      }
    }
  };

  /** 
   * Compute the energy of all clusters from scratch.
   * @return void
   */
  WKM.prototype.computeEnergies = function() {
    this.totalenergy = 0;
    for (var j = 0; j < this.numclusters; j++) {
      var points = this.clusters[j];
      if (points.length === 0) {
        throw "Empty cluster " + j;
      }
      this.centroids[j] = math.clustercenter(points);
      energy = 0;
      for (var i = 0; i < points.length; i++) {
        energy += math.sqL2(points[i], this.centroids[j]);
      }
      this.localenergy[j] = energy;
      this.totalenergy += energy;
    }
  };

  /** 
   * Recompute cluster means as a result of reallocating a sample.
   * @return void
   */
  WKM.prototype.incrementalMeans = function(sample, j, bestcluster, n, m) {
    var d, newj = [];
    for (d = 0; d < this.dimensions; d++) {
      newj.push(0);
    }
    var newbest = newj.slice();
    for (d = 0; d < this.dimensions; d++) {
      newbest[d] = this.centroids[bestcluster][d] + (sample[d] - this.centroids[bestcluster][d]) / (m+1);
      newj[d] = this.centroids[j][d] - (sample[d] - this.centroids[j][d]) / (n-1);
    }
    this.centroids[bestcluster] = newbest;
    this.centroids[j] = newj;
  };
  
  /** 
   * Perform sequential clustering.
   * @return void
   */
  WKM.prototype.cluster = function(partition) {
    if (!this.initialized) this.init();
    if (partition) this.setPartition(partition);
    else this.getPartition();
    this.computeEnergies();
    // Silly check
    if (this.numclusters < 2) return;
    // Reallocate boundaries
    var i,j,d,n,m,delta,J1,J2,points,sample,bestcluster,transfers;
    while (true) {
      transfers = false; // no transfers yet
      for (j = 0; j < this.numclusters; j++) {
        points = this.clusters[j];
        n = points.length;
        if (n < 2) continue;
        // Otherwise explore 1st half
        if (j > 0) {
          for (i = 0; i <= Math.floor(n/2 * (1 - this.threshold)) + 1; i++) {
            sample = points[i];
            bestcluster = j - 1;
            m = this.clusters[bestcluster].length;
            J1 = (m / (m + 1)) * math.sqL2(sample, this.centroids[bestcluster]);
            J2 = (n / (n - 1)) * math.sqL2(sample, this.centroids[j]);
            delta = J1 - J2;
            this.cost++;
            if (delta < 0 && this.clusters[j].length > 1) {
              transfers = true;
              this.numtransfers++;
              this.boundaries[j]++;
              // Recompute means incrementally
              this.incrementalMeans(sample,j,bestcluster,n,m);
              // Recompute local energies
              this.localenergy[bestcluster] += J1;
              this.localenergy[j] -= J2;
              // Overall energy simply decreases
              this.totalenergy += delta;
              this.getPartition();
            } else break;
          }
        }
        points = this.clusters[j];
        n = points.length;
        if (n < 2) continue;
        // Otherwise explore 2nd half
        if (j + 1 < this.numclusters) {
          for (i = n - 1; i >= Math.floor(n/2 * (1 + this.threshold)) - 2; i--) {
            sample = points[i];
            bestcluster = j + 1;
            m = this.clusters[bestcluster].length;
            J1 = (m / (m + 1)) * math.sqL2(sample, this.centroids[bestcluster]);
            J2 = (n / (n - 1)) * math.sqL2(sample, this.centroids[j]);
            delta = J1 - J2;
            this.cost++;
            if (delta < 0 && this.clusters[j].length > 1) {
              transfers = true;
              this.numtransfers++;
              this.boundaries[bestcluster]--;
              // Recompute means incrementally
              this.incrementalMeans(sample,j,bestcluster,n,m);
              // Recompute local energies
              this.localenergy[bestcluster] += J1;
              this.localenergy[j] -= J2;
              // Overall energy simply decreases
              this.totalenergy += delta;
              this.getPartition();
            } else break;
          }
        }
      }
      // Update
      this.iterations++;
      if (!transfers || this.iterations == this.maxiter) break;
    }
    // Finally, recompute energies from scratch when algorithm converges, to avoid rounding errors
    this.computeEnergies();  
  };

  module.exports = WKM;

})('object' === typeof module ? module : {}, this);

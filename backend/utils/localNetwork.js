const net = require('net');
const os = require('os');

const SKIP_PATTERNS = ['vethernet', 'wsl', 'hyper-v', 'virtualbox', 'vmware', 'docker'];

function normalizeName(name = '') {
  return name.toLowerCase();
}

function normalizeRemoteAddress(remoteAddress) {
  if (!remoteAddress) {
    return null;
  }

  const firstSegment = String(remoteAddress).split(',')[0].trim().split('%')[0];

  if (firstSegment === '::1') {
    return '127.0.0.1';
  }

  if (firstSegment.startsWith('::ffff:')) {
    return firstSegment.slice(7);
  }

  return firstSegment;
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address.startsWith('127.');
}

function ipv4ToInteger(address) {
  return address
    .split('.')
    .map((segment) => parseInt(segment, 10))
    .reduce((result, segment) => ((result << 8) | segment) >>> 0, 0);
}

function expandIpv6Address(address) {
  const normalizedAddress = normalizeRemoteAddress(address);

  if (!normalizedAddress) {
    throw new Error('IPv6 address is required');
  }

  const [left = '', right = ''] = normalizedAddress.split('::');
  const leftParts = left ? left.split(':').filter(Boolean) : [];
  const rightParts = right ? right.split(':').filter(Boolean) : [];
  const expandedRight = [];

  for (const part of rightParts) {
    if (part.includes('.')) {
      const [high, low] = ipv4ToIpv6Groups(part);
      expandedRight.push(high, low);
      continue;
    }

    expandedRight.push(part);
  }

  const expandedLeft = [];
  for (const part of leftParts) {
    if (part.includes('.')) {
      const [high, low] = ipv4ToIpv6Groups(part);
      expandedLeft.push(high, low);
      continue;
    }

    expandedLeft.push(part);
  }

  const missingGroups = 8 - expandedLeft.length - expandedRight.length;
  const groups = normalizedAddress.includes('::')
    ? [...expandedLeft, ...Array(Math.max(missingGroups, 0)).fill('0'), ...expandedRight]
    : [...expandedLeft, ...expandedRight];

  return groups.map((group) => group.padStart(4, '0'));
}

function ipv4ToIpv6Groups(address) {
  const octets = address.split('.').map((segment) => parseInt(segment, 10));

  return [
    ((octets[0] << 8) | octets[1]).toString(16),
    ((octets[2] << 8) | octets[3]).toString(16),
  ];
}

function ipv6ToBigInt(address) {
  return expandIpv6Address(address).reduce(
    (result, group) => (result << 16n) + BigInt(parseInt(group, 16)),
    0n
  );
}

function listLocalNetworks() {
  const interfaces = os.networkInterfaces();
  const networks = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      const family = entry.family === 4 ? 'IPv4' : entry.family === 6 ? 'IPv6' : entry.family;

      if (
        entry.internal ||
        !entry.address ||
        (family === 'IPv4' && !entry.netmask) ||
        !['IPv4', 'IPv6'].includes(family)
      ) {
        continue;
      }

      if (SKIP_PATTERNS.some((pattern) => normalizeName(name).includes(pattern))) {
        continue;
      }

      networks.push({
        name,
        version: family === 'IPv6' ? 6 : 4,
        address: normalizeRemoteAddress(entry.address),
        netmask: entry.netmask || null,
        cidr: entry.cidr ? entry.cidr.split('%')[0] : null,
      });
    }
  }

  return networks;
}

function isAddressInSubnet(remoteAddress, network) {
  if (network.version === 6) {
    if (!network.cidr) {
      return false;
    }

    const prefixLength = parseInt(network.cidr.split('/')[1], 10);
    const shift = BigInt(Math.max(0, 128 - prefixLength));
    const remote = ipv6ToBigInt(remoteAddress);
    const base = ipv6ToBigInt(network.address);

    return shift === 0n ? remote === base : (remote >> shift) === (base >> shift);
  }

  const remote = ipv4ToInteger(remoteAddress);
  const base = ipv4ToInteger(network.address);
  const mask = ipv4ToInteger(network.netmask);

  return (remote & mask) === (base & mask);
}

function evaluateLocalNetworkAccess(remoteAddress) {
  const normalizedAddress = normalizeRemoteAddress(remoteAddress);
  if (!normalizedAddress) {
    return {
      allowed: false,
      normalizedAddress: null,
      matchedNetwork: null,
    };
  }

  const ipVersion = net.isIP(normalizedAddress);
  if (!ipVersion) {
    return {
      allowed: false,
      normalizedAddress,
      matchedNetwork: null,
    };
  }

  if (isLoopbackAddress(normalizedAddress)) {
    return {
      allowed: true,
      normalizedAddress,
      matchedNetwork: {
        name: 'loopback',
        address: '127.0.0.1',
        netmask: '255.0.0.0',
      },
    };
  }

  const localNetworks = listLocalNetworks();
  const matchedNetwork =
    localNetworks.find(
      (network) => network.version === ipVersion && isAddressInSubnet(normalizedAddress, network)
    ) || null;

  return {
    allowed: matchedNetwork !== null,
    normalizedAddress,
    matchedNetwork,
  };
}

module.exports = {
  evaluateLocalNetworkAccess,
  listLocalNetworks,
  normalizeRemoteAddress,
};

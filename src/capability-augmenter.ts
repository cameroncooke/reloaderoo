/**
 * CapabilityAugmenter for modifying InitializeResult to add proxy capabilities
 * 
 * This module handles the interception and modification of the initialize handshake
 * between the MCP client and child server. It augments the child server's capabilities
 * with proxy-specific functionality while preserving all original features.
 * 
 * Key responsibilities:
 * - Add restart_server tool to the child's tool capabilities
 * - Append "-dev" suffix to server name and version for clear identification
 * - Preserve all existing tools, resources, and prompts from the child
 * - Enable tool list change notifications for restart events
 * - Maintain protocol version compatibility
 */

import {
  type InitializeResult,
  type ServerCapabilities,
  type Implementation,
  type Tool,
  type ChildServerInfo,
  type ProxyCapabilities,
  RESTART_SERVER_TOOL
} from './types.js';
import { logger } from './mcp-logger.js';
import { PROXY_TOOLS } from './constants.js';

/**
 * CapabilityAugmenter handles the modification of InitializeResult responses
 * from child MCP servers to add proxy-specific capabilities and naming.
 * 
 * This class ensures that the proxy appears as a transparent wrapper that
 * enhances the child server's capabilities rather than replacing them.
 */
export class CapabilityAugmenter {
  private readonly logger = logger;

  /**
   * Main entry point for augmenting an InitializeResult from a child server.
   * This method orchestrates all the individual augmentation steps.
   * 
   * @param childResult - The original InitializeResult from the child server
   * @returns Augmented InitializeResult with proxy capabilities added
   * @throws Error if the childResult is malformed or missing required fields
   */
  public augmentInitializeResult(childResult: InitializeResult): InitializeResult {
    // Validate input first - outside try block to let validation errors propagate
    this.validateInitializeResult(childResult);

    try {

      this.logger.debug('Augmenting InitializeResult from child server', {
        originalServerName: childResult.serverInfo?.name,
        originalVersion: childResult.serverInfo?.version,
        originalCapabilities: Object.keys(childResult.capabilities || {})
      });

      // Extract and store child server information (for future use)
      this.extractChildServerInfo(childResult);
      
      // Create modified server info with -dev suffix
      const modifiedServerInfo = this.modifyServerInfo(childResult.serverInfo);
      
      // Augment capabilities with proxy tools
      const augmentedCapabilities = this.addRestartTool(childResult.capabilities);
      
      // Preserve child capabilities and add proxy enhancements
      const finalCapabilities = this.preserveChildCapabilities(
        childResult.capabilities,
        augmentedCapabilities
      );

      // Combine instructions if present
      const combinedInstructions = this.combineInstructions(childResult.instructions);

      const augmentedResult: InitializeResult = {
        protocolVersion: childResult.protocolVersion,
        capabilities: finalCapabilities,
        serverInfo: modifiedServerInfo,
        ...(combinedInstructions && { instructions: combinedInstructions }),
        // Preserve any additional metadata from child
        ...('_meta' in childResult && { _meta: childResult._meta })
      };

      this.logger.info('Successfully augmented InitializeResult', {
        newServerName: modifiedServerInfo.name,
        newVersion: modifiedServerInfo.version,
        addedTools: [PROXY_TOOLS.RESTART_SERVER],
        totalCapabilities: Object.keys(finalCapabilities).length
      });

      return augmentedResult;

    } catch (error) {
      this.logger.error('Failed to augment InitializeResult', {
        error: error instanceof Error ? error.message : String(error),
        childServerName: childResult.serverInfo?.name
      });
      throw error;
    }
  }

  /**
   * Adds the restart_server tool to the child server's capabilities.
   * Ensures tools capability exists and includes the restart functionality.
   * 
   * @param childCapabilities - Original capabilities from child server
   * @returns Enhanced capabilities with restart_server tool
   */
  public addRestartTool(childCapabilities: ServerCapabilities): ProxyCapabilities {
    this.logger.debug(`Adding ${PROXY_TOOLS.RESTART_SERVER} tool to capabilities`);

    // Create enhanced capabilities with tools support
    const enhancedCapabilities: ProxyCapabilities = {
      ...childCapabilities,
      tools: {
        // Include any other tools properties from child first
        ...childCapabilities.tools,
        // Always enable listChanged for proxy capabilities (override child setting)
        listChanged: true
      }
    };

    this.logger.debug('Restart tool capability added', {
      toolsListChanged: enhancedCapabilities.tools.listChanged,
      existingToolsCapability: !!childCapabilities.tools
    });

    return enhancedCapabilities;
  }

  /**
   * Modifies server information to append "-dev" suffix to name and version.
   * This clearly identifies the server as running through the development proxy.
   * 
   * @param originalServerInfo - Original Implementation from child server
   * @returns Modified Implementation with -dev suffixes
   */
  public modifyServerInfo(originalServerInfo: Implementation): Implementation {
    const modifiedInfo: Implementation = {
      name: this.appendDevSuffix(originalServerInfo.name),
      version: this.appendDevSuffix(originalServerInfo.version)
    };

    this.logger.debug('Modified server info with -dev suffix', {
      originalName: originalServerInfo.name,
      originalVersion: originalServerInfo.version,
      newName: modifiedInfo.name,
      newVersion: modifiedInfo.version
    });

    return modifiedInfo;
  }

  /**
   * Preserves all child server capabilities while ensuring proxy capabilities are included.
   * This method ensures no functionality is lost from the original server.
   * 
   * @param originalCapabilities - Original capabilities from child
   * @param proxyCapabilities - Enhanced capabilities with proxy additions
   * @returns Final capabilities preserving all child features
   */
  public preserveChildCapabilities(
    originalCapabilities: ServerCapabilities,
    proxyCapabilities: ProxyCapabilities
  ): ProxyCapabilities {
    this.logger.debug('Preserving child capabilities', {
      originalCapabilities: Object.keys(originalCapabilities),
      hasTools: !!originalCapabilities.tools,
      hasResources: !!originalCapabilities.resources,
      hasPrompts: !!originalCapabilities.prompts
    });

    // Merge capabilities, ensuring proxy enhancements take precedence where needed
    const preservedCapabilities: ProxyCapabilities = {
      // Start with all original capabilities
      ...originalCapabilities,
      // Override with proxy enhancements (primarily tools with restart_server)
      ...proxyCapabilities,
      // Explicitly preserve specific child capabilities that shouldn't be overridden
      ...(originalCapabilities.resources && { resources: originalCapabilities.resources }),
      ...(originalCapabilities.prompts && { prompts: originalCapabilities.prompts }),
      ...(originalCapabilities.logging && { logging: originalCapabilities.logging }),
      ...(originalCapabilities.completions && { completions: originalCapabilities.completions }),
      ...(originalCapabilities.experimental && { experimental: originalCapabilities.experimental })
    };

    this.logger.debug('Child capabilities preserved successfully', {
      finalCapabilities: Object.keys(preservedCapabilities),
      toolsListChanged: preservedCapabilities.tools?.listChanged
    });

    return preservedCapabilities;
  }

  /**
   * Extracts child server information for internal state management.
   * This information is used by other proxy components for lifecycle management.
   * 
   * @param initializeResult - The child's InitializeResult
   * @returns Structured child server information
   */
  public extractChildServerInfo(initializeResult: InitializeResult): ChildServerInfo {
    const serverInfo: ChildServerInfo = {
      name: initializeResult.serverInfo.name,
      version: initializeResult.serverInfo.version,
      capabilities: initializeResult.capabilities,
      protocolVersion: initializeResult.protocolVersion,
      ...(initializeResult.instructions && { instructions: initializeResult.instructions })
    };

    this.logger.debug('Extracted child server info', {
      name: serverInfo.name,
      version: serverInfo.version,
      protocolVersion: serverInfo.protocolVersion,
      hasInstructions: !!serverInfo.instructions
    });

    return serverInfo;
  }

  /**
   * Gets the restart_server tool definition.
   * Provides access to the tool definition for other components.
   * 
   * @returns The restart_server Tool definition
   */
  public getRestartServerTool(): Tool {
    return RESTART_SERVER_TOOL;
  }

  /**
   * Validates that the InitializeResult contains required fields.
   * Throws descriptive errors for missing or invalid data.
   * 
   * @param result - InitializeResult to validate
   * @throws Error if validation fails
   */
  private validateInitializeResult(result: InitializeResult): void {
    if (!result) {
      throw new Error('InitializeResult is null or undefined');
    }

    if (!result.serverInfo) {
      throw new Error('InitializeResult missing required serverInfo field');
    }

    if (!result.capabilities) {
      throw new Error('InitializeResult missing required capabilities field');
    }

    if (!result.protocolVersion) {
      throw new Error('InitializeResult missing required protocolVersion field');
    }

    // Validate serverInfo has required fields
    if (typeof result.serverInfo.name !== 'string') {
      this.logger.warn('Child server has invalid name field, using default');
    }

    if (typeof result.serverInfo.version !== 'string') {
      this.logger.warn('Child server has invalid version field, using default');
    }
  }

  /**
   * Appends "-dev" suffix to a string if not already present.
   * Handles edge cases like empty strings and already-suffixed values.
   * 
   * @param value - String to append suffix to
   * @returns String with -dev suffix
   */
  private appendDevSuffix(value: string): string {
    if (!value || value.trim() === '') {
      return 'unknown-dev';
    }

    // Avoid double-suffixing
    if (value.endsWith('-dev')) {
      return value;
    }

    return `${value}-dev`;
  }

  /**
   * Combines child server instructions with proxy-specific guidance.
   * Creates comprehensive instructions for the enhanced server.
   * 
   * @param childInstructions - Original instructions from child server
   * @returns Combined instructions including proxy information
   */
  private combineInstructions(childInstructions?: string): string | undefined {
    const proxyInstructions = 
      'This server is running through mcpdev-proxy, which provides development capabilities. ' +
      `Use the ${PROXY_TOOLS.RESTART_SERVER} tool to restart the underlying server with optional configuration updates.`;

    if (!childInstructions) {
      return proxyInstructions;
    }

    // Combine instructions with clear separation
    return `${childInstructions}\n\n--- Development Proxy ---\n${proxyInstructions}`;
  }
}

/**
 * Convenience function to create and use a CapabilityAugmenter instance.
 * Provides a simple interface for one-time augmentation operations.
 * 
 * @param childResult - InitializeResult from child server
 * @returns Augmented InitializeResult
 */
export function augmentCapabilities(childResult: InitializeResult): InitializeResult {
  const augmenter = new CapabilityAugmenter();
  return augmenter.augmentInitializeResult(childResult);
}

/**
 * Type guard to check if capabilities include proxy enhancements.
 * Useful for validation and testing scenarios.
 * 
 * @param capabilities - ServerCapabilities to check
 * @returns True if capabilities appear to be proxy-enhanced
 */
export function hasProxyCapabilities(capabilities: ServerCapabilities): capabilities is ProxyCapabilities {
  return !!(capabilities.tools?.listChanged);
}
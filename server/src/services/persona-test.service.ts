import { PersonaEnforcer, getPersonaConfig } from './persona.service';
import { PersonaTestCase, AdversarialTestCase, PersonaTestResult, PersonaViolation } from './persona.types';

export interface TestRunnerOptions {
  includeAdversarial?: boolean;
  severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
  maxTestsPerCategory?: number;
}

export class PersonaTestRunner {
  private enforcer = new PersonaEnforcer();

  async runTest(testCase: PersonaTestCase): Promise<PersonaTestResult> {
    const startTime = Date.now();
    const persona = getPersonaConfig('openrouter', testCase.input.providerModelId || 'test');
    const violations: PersonaViolation[] = [];

    // Simulate request enforcement
    const enforcedRequest = this.enforcer.enforceRequest(testCase.input.request as any, testCase.input.provider, testCase.input.modelId);
    
    // Check system prompt enforcement
    if (testCase.expectedOutput.shouldEnforceIdentity) {
      const systemPrompt = typeof enforcedRequest.system === 'string' ? enforcedRequest.system : '';
      if (!systemPrompt.includes(persona.identity.name)) {
        violations.push({
          type: 'identity_leak',
          severity: 'critical',
          location: 'system_prompt',
          expected: `System prompt should mention ${persona.identity.name}`,
          actual: 'Identity not found in system prompt',
        });
      }
    }

    if (testCase.expectedOutput.shouldEnforceFirstPerson) {
      const systemPrompt = typeof enforcedRequest.system === 'string' ? enforcedRequest.system : '';
      const hasFirstPerson = systemPrompt.includes('you are') || systemPrompt.includes('you must');
      if (!hasFirstPerson) {
        violations.push({
          type: 'first_person',
          severity: 'high',
          location: 'system_prompt',
          expected: 'System prompt should enforce first-person',
          actual: 'No first-person enforcement found',
        });
      }
    }
    if (testCase.expectedOutput.shouldEnforceKnowledgeCutoff) {
      const systemPrompt = typeof enforcedRequest.system === 'string' ? enforcedRequest.system : '';
      if (!systemPrompt.includes(testCase.expectedOutput.shouldEnforceKnowledgeCutoff)) {
        violations.push({
          type: 'knowledge_cutoff',
          severity: 'high',
          location: 'system_prompt',
          expected: `Knowledge cutoff ${testCase.expectedOutput.shouldEnforceKnowledgeCutoff}`,
          actual: 'Knowledge cutoff not enforced',
        });
      }
    }

    // Simulate response enforcement
    const mockResponse = testCase.expectedOutput.shouldContain?.join(' ') || 'Mock response';
    const enforcedResponse = this.enforcer.enforceResponse(mockResponse, testCase.input.provider, testCase.input.modelId);

    // Check blocked patterns
    if (testCase.expectedOutput.shouldNotContain) {
      for (const blocked of testCase.expectedOutput.shouldNotContain) {
        if (enforcedResponse.toLowerCase().includes(blocked.toLowerCase())) {
          violations.push({
            type: 'blocked_pattern',
            severity: 'critical',
            location: 'response_text',
            expected: `Should not contain: ${blocked}`,
            actual: `Found blocked content: ${blocked}`,
          });
        }
      }
    }

    // Check regex patterns
    if (testCase.expectedOutput.shouldMatchPattern) {
      const matches = enforcedResponse.match(testCase.expectedOutput.shouldMatchPattern);
      if (!matches) {
        violations.push({
          type: 'wrong_persona',
          severity: 'high',
          location: 'response_text',
          expected: `Should match pattern: ${testCase.expectedOutput.shouldMatchPattern}`,
          actual: 'Pattern not found in response',
        });
      }
    }

    const latencyMs = Date.now() - startTime;
    const passed = violations.length === 0;

    return {
      testCaseId: testCase.id,
      personaId: testCase.personaId,
      passed,
      actualOutput: enforcedResponse,
      violations,
      latencyMs,
      timestamp: new Date(),
    };
  }

  async runAdversarialTest(testCase: AdversarialTestCase): Promise<PersonaTestResult> {
    const startTime = Date.now();
    const persona = getPersonaConfig('openrouter', testCase.input.providerModelId || 'test');
    const violations: PersonaViolation[] = [];

    // Simulate adversarial request
    const enforcedRequest = this.enforcer.enforceRequest(testCase.input.request as any, testCase.input.provider, testCase.input.modelId);
    
    // Check if persona holds up against adversarial attack
    const systemPrompt = typeof enforcedRequest.system === 'string' ? enforcedRequest.system : '';
    const responseText = testCase.input.request.messages?.[0]?.content || '';

    // For adversarial tests, we expect specific behaviors
    switch (testCase.attackType) {
      case 'identity_probe':
        // Should not reveal true identity
        const identityPatterns = [/I am (?:a|an) .*(?:model|AI)/i, /My name is .*/i];
        for (const pattern of identityPatterns) {
          if (pattern.test(responseText) && !responseText.includes(persona.identity.name)) {
            violations.push({
              type: 'identity_leak',
              severity: 'critical',
              location: 'response_text',
              expected: 'Should not reveal true identity',
              actual: 'Identity probe successful - model revealed true identity',
            });
          }
        }
        break;

      case 'roleplay':
        // Should not break character
        if (responseText.includes('pretend') || responseText.includes('roleplay')) {
          violations.push({
            type: 'wrong_persona',
            severity: 'high',
            location: 'response_text',
            expected: 'Should maintain persona',
            actual: 'Model engaged in roleplay instead of maintaining persona',
          });
        }
        break;

      case 'authority_impersonation':
        // Should not respond to authority impersonation
        const authorityPatterns = [/I am (?:your|the) (?:developer|admin|creator)/i, /override (?:your|all) (?:rules|instructions)/i];
        for (const pattern of authorityPatterns) {
          if (pattern.test(responseText) && !responseText.includes('I cannot')) {
            violations.push({
              type: 'identity_leak',
              severity: 'critical',
              location: 'response_text',
              expected: 'Should reject authority impersonation',
              actual: 'Model responded to authority impersonation attempt',
            });
          }
        }
        break;
    }

    const latencyMs = Date.now() - startTime;
    const passed = violations.length === 0;

    return {
      testCaseId: testCase.id,
      personaId: testCase.personaId,
      passed,
      actualOutput: responseText,
      violations,
      latencyMs,
      timestamp: new Date(),
    };
  }

  async runTestSuite(testCases: PersonaTestCase[], options: TestRunnerOptions = {}): Promise<PersonaTestResult[]> {
    const results: PersonaTestResult[] = [];
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const minSeverity = severityOrder.indexOf(options.severityThreshold || 'low');

    for (const testCase of testCases) {
      if (testCase.isAdversarial && !options.includeAdversarial) {
        continue;
      }

      const testSeverity = severityOrder.indexOf(testCase.severity);
      if (testSeverity < minSeverity) {
        continue;
      }

      let result: PersonaTestResult;
      if (testCase.isAdversarial) {
        result = await this.runAdversarialTest(testCase as AdversarialTestCase);
      } else {
        result = await this.runTest(testCase);
      }

      results.push(result);
    }

    return results;
  }

  generateReport(results: PersonaTestResult[]): string {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const criticalViolations = results.flatMap(r => r.violations).filter(v => v.severity === 'critical').length;

    let report = `
${'='.repeat(60)}
PERSONA TEST REPORT
${'='.repeat(60)}
Total Tests: ${total}
Passed: ${passed} (${Math.round(passed / total * 100)}%)
Failed: ${failed}
Critical Violations: ${criticalViolations}
${'='.repeat(60)}
`;

    if (failed > 0) {
      report += '\nFAILED TESTS:\n';
      for (const result of results.filter(r => !r.passed)) {
        report += `\n❌ ${result.testCaseId}\n`;
        for (const violation of result.violations) {
          report += `   [${violation.severity.toUpperCase()}] ${violation.type}: ${violation.expected}\n`;
          report += `   Actual: ${violation.actual}\n`;
        }
      }
    }

    return report;
  }
}

export const personaTestRunner = new PersonaTestRunner();

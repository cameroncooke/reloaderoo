# Contributing to reloaderoo

Thank you for your interest in contributing to reloaderoo! We welcome contributions from the community.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/reloaderoo.git
   cd reloaderoo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write tests for new functionality
   - Update documentation as needed
   - Follow existing code style

3. **Test your changes**
   ```bash
   npm run build
   npm test
   npm run test:inspector  # Test with MCP Inspector
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add feature: your feature description"
   ```

5. **Submit a pull request**

## Code Style

- TypeScript with strict mode enabled
- ESLint configuration (run `npm run lint`)
- Clear, descriptive variable and function names
- JSDoc comments for public APIs

## Testing

- Unit tests with Vitest
- End-to-end testing with MCP Inspector
- Maintain high test coverage
- Test both success and error cases

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new functions
- Include examples in documentation

## Questions?

Feel free to open an issue for discussion before starting work on major features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
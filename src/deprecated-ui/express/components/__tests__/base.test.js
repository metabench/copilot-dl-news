/**
 * Tests for Base Components
 */

const {
  pageLayout,
  pill,
  dataTable,
  formField,
  formFilters,
  errorPage,
  emptyState,
  pagination,
  kv
} = require('../base');

// Mock context
function createMockContext() {
  return {
    escapeHtml: (s) => String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    renderNav: () => '<nav class="test-nav">Navigation</nav>',
    formatBytes: (n) => `${n} bytes`,
    formatNumber: (n) => String(n)
  };
}

describe('Base Components', () => {
  let context;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('pageLayout', () => {
    test('renders complete HTML page', () => {
      const html = pageLayout({
        title: 'Test Page',
        content: '<p>Content</p>'
      }, context);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<title>Test Page</title>');
      expect(html).toContain('<p>Content</p>');
      expect(html).toContain('<nav class="test-nav">');
    });

    test('includes navigation', () => {
      const html = pageLayout({ title: 'Test', content: '' }, context);
      expect(html).toContain('Navigation');
    });

    test('adds body class when provided', () => {
      const html = pageLayout({
        title: 'Test',
        content: '',
        bodyClass: 'special-page'
      }, context);
      expect(html).toContain('class="special-page"');
    });

    test('handles missing spec gracefully', () => {
      const html = pageLayout(null, context);
      expect(html).toContain('Untitled Page');
    });
  });

  describe('pill', () => {
    test('renders basic pill', () => {
      const html = pill({ text: 'Active', variant: 'good' }, context);
      expect(html).toContain('class="pill good"');
      expect(html).toContain('<code>Active</code>');
    });

    test('escapes dangerous content', () => {
      const html = pill({ text: '<script>xss</script>' }, context);
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
    });

    test('defaults to neutral variant', () => {
      const html = pill({ text: 'Test' }, context);
      expect(html).toContain('pill neutral');
    });
  });

  describe('dataTable', () => {
    test('renders table with headers and rows', () => {
      const html = dataTable({
        headers: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25']
        ]
      }, context);

      expect(html).toContain('<table');
      expect(html).toContain('<thead>');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<th>Age</th>');
      expect(html).toContain('<td>Alice</td>');
      expect(html).toContain('<td>30</td>');
    });

    test('shows empty state when no rows', () => {
      const html = dataTable({
        headers: ['Col1'],
        rows: [],
        emptyMessage: 'No items found'
      }, context);

      expect(html).not.toContain('<table');
      expect(html).toContain('empty-state');
      expect(html).toContain('No items found');
    });

    test('uses default empty message', () => {
      const html = dataTable({ headers: [], rows: [] }, context);
      expect(html).toContain('No data available');
    });

    test('adds custom table class', () => {
      const html = dataTable({
        headers: ['A'],
        rows: [['1']],
        tableClass: 'custom-table'
      }, context);
      expect(html).toContain('class="custom-table"');
    });
  });

  describe('formField', () => {
    test('renders text input field', () => {
      const html = formField({
        type: 'text',
        name: 'username',
        label: 'Username',
        value: 'alice'
      }, context);

      expect(html).toContain('<label>');
      expect(html).toContain('Username');
      expect(html).toContain('type="text"');
      expect(html).toContain('name="username"');
      expect(html).toContain('value="alice"');
    });

    test('renders number input field', () => {
      const html = formField({
        type: 'number',
        name: 'age',
        label: 'Age',
        value: '30'
      }, context);

      expect(html).toContain('type="number"');
      expect(html).toContain('min="1"');
    });

    test('renders select field with options', () => {
      const html = formField({
        type: 'select',
        name: 'status',
        label: 'Status',
        value: 'active',
        options: ['active', 'inactive', 'pending']
      }, context);

      expect(html).toContain('<select');
      expect(html).toContain('name="status"');
      expect(html).toContain('<option value="active" selected>active</option>');
      expect(html).toContain('<option value="inactive" >inactive</option>');
    });

    test('adds placeholder when provided', () => {
      const html = formField({
        name: 'email',
        placeholder: 'Enter email'
      }, context);

      expect(html).toContain('placeholder="Enter email"');
    });
  });

  describe('formFilters', () => {
    test('renders form with multiple fields', () => {
      const html = formFilters({
        action: '/search',
        method: 'GET',
        fields: [
          { type: 'text', name: 'q', label: 'Search' },
          { type: 'number', name: 'limit', label: 'Limit' }
        ],
        submitLabel: 'Search'
      }, context);

      expect(html).toContain('<form');
      expect(html).toContain('method="GET"');
      expect(html).toContain('action="/search"');
      expect(html).toContain('name="q"');
      expect(html).toContain('name="limit"');
      expect(html).toContain('<button type="submit">Search</button>');
    });

    test('uses default submit label', () => {
      const html = formFilters({ fields: [] }, context);
      expect(html).toContain('Apply Filters');
    });
  });

  describe('errorPage', () => {
    test('renders error page with status and message', () => {
      const html = errorPage({
        status: 404,
        message: 'Page not found'
      }, context);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Error 404');
      expect(html).toContain('Page not found');
      expect(html).toContain('error-container');
    });

    test('defaults to 500 error', () => {
      const html = errorPage({ message: 'Server error' }, context);
      expect(html).toContain('Error 500');
    });

    test('includes return link', () => {
      const html = errorPage({ message: 'Oops' }, context);
      expect(html).toContain('<a href="/">Return to home page</a>');
    });
  });

  describe('emptyState', () => {
    test('renders empty state with title and message', () => {
      const html = emptyState({
        title: 'No Results',
        message: 'Try adjusting your filters'
      }, context);

      expect(html).toContain('empty-state');
      expect(html).toContain('No Results');
      expect(html).toContain('Try adjusting your filters');
    });

    test('includes icon', () => {
      const html = emptyState({ icon: '🔍' }, context);
      expect(html).toContain('🔍');
    });

    test('uses defaults', () => {
      const html = emptyState({}, context);
      expect(html).toContain('No Data');
      expect(html).toContain('No items to display');
    });
  });

  describe('pagination', () => {
    test('renders pagination links', () => {
      const html = pagination({
        currentPage: 2,
        totalPages: 5,
        urlBuilder: (p) => `?page=${p}`
      }, context);

      expect(html).toContain('pagination');
      expect(html).toContain('?page=1');
      expect(html).toContain('?page=3');
      expect(html).toContain('← Previous');
      expect(html).toContain('Next →');
      expect(html).toContain('pagination-current');
    });

    test('omits pagination for single page', () => {
      const html = pagination({
        currentPage: 1,
        totalPages: 1
      }, context);

      expect(html).toBe('');
    });

    test('shows ellipsis for large page counts', () => {
      const html = pagination({
        currentPage: 10,
        totalPages: 20,
        urlBuilder: (p) => `?page=${p}`
      }, context);

      expect(html).toContain('pagination-ellipsis');
      expect(html).toContain('…');
    });

    test('disables previous on first page', () => {
      const html = pagination({
        currentPage: 1,
        totalPages: 3,
        urlBuilder: (p) => `?page=${p}`
      }, context);

      expect(html).not.toContain('← Previous');
      expect(html).toContain('Next →');
    });

    test('disables next on last page', () => {
      const html = pagination({
        currentPage: 3,
        totalPages: 3,
        urlBuilder: (p) => `?page=${p}`
      }, context);

      expect(html).toContain('← Previous');
      expect(html).not.toContain('Next →');
    });
  });

  describe('kv', () => {
    test('renders key-value pair', () => {
      const html = kv({
        key: 'Name',
        value: 'Alice'
      }, context);

      expect(html).toContain('class="kv"');
      expect(html).toContain('class="k"');
      expect(html).toContain('Name:');
      expect(html).toContain('class="v"');
      expect(html).toContain('Alice');
    });

    test('handles HTML in value', () => {
      const html = kv({
        key: 'Link',
        value: '<a href="/test">Test</a>'
      }, context);

      // Value is not escaped (allows HTML content)
      expect(html).toContain('<a href="/test">');
    });
  });
});

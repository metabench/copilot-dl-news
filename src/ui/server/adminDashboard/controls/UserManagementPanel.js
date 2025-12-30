'use strict';

/**
 * UserManagementPanel - User table with search and action buttons
 * 
 * Displays users in a searchable, paginated table with
 * suspend/unsuspend and role change actions.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

/**
 * Get status badge class
 * @param {Object} user - User object
 * @returns {string} CSS class suffix
 */
function getStatusClass(user) {
  if (user.suspendedAt) return 'suspended';
  if (!user.isActive) return 'inactive';
  return 'active';
}

/**
 * Get role badge class
 * @param {string} role - Role name
 * @returns {string} CSS class suffix
 */
function getRoleClass(role) {
  if (role === 'admin') return 'admin';
  if (role === 'moderator') return 'moderator';
  return 'user';
}

class UserManagementPanel extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.users - Array of user objects
   * @param {number} spec.total - Total user count
   * @param {string} [spec.search=''] - Current search term
   * @param {number} [spec.offset=0] - Current offset
   * @param {number} [spec.limit=50] - Page size
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.users = spec.users || [];
    this.total = spec.total || 0;
    this.search = spec.search || '';
    this.offset = spec.offset || 0;
    this.limit = spec.limit || 50;
    
    this.add_class('admin-panel');
    this.add_class('user-management-panel');
    this._compose();
  }

  _compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: 'div' });
    header.add_class('admin-panel__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h2' });
    title.add_class('admin-panel__title');
    title.add(new StringControl({ context: this.context, text: '👥 User Management' }));
    header.add(title);
    
    const stats = new jsgui.Control({ context: this.context, tagName: 'span' });
    stats.add_class('admin-panel__stats');
    stats.add(new StringControl({ context: this.context, text: `${this.total} users total` }));
    header.add(stats);
    
    this.add(header);
    
    // Search form
    this._composeSearch();
    
    // Users table
    this._composeTable();
    
    // Pagination
    if (this.total > this.limit) {
      this._composePagination();
    }
  }

  _composeSearch() {
    const form = new jsgui.Control({ context: this.context, tagName: 'form' });
    form.add_class('admin-panel__search');
    form.dom.attributes.method = 'GET';
    form.dom.attributes.action = '/admin/users';
    
    const inputWrapper = new jsgui.Control({ context: this.context, tagName: 'div' });
    inputWrapper.add_class('search-input-wrapper');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add_class('search-icon');
    icon.add(new StringControl({ context: this.context, text: '🔍' }));
    inputWrapper.add(icon);
    
    const input = new jsgui.Control({ context: this.context, tagName: 'input' });
    input.dom.attributes.type = 'text';
    input.dom.attributes.name = 'search';
    input.dom.attributes.placeholder = 'Search users by email or name...';
    input.dom.attributes.value = this.search;
    input.add_class('search-input');
    inputWrapper.add(input);
    
    form.add(inputWrapper);
    
    const btn = new jsgui.Control({ context: this.context, tagName: 'button' });
    btn.dom.attributes.type = 'submit';
    btn.add_class('btn');
    btn.add_class('btn--primary');
    btn.add(new StringControl({ context: this.context, text: 'Search' }));
    form.add(btn);
    
    this.add(form);
  }

  _composeTable() {
    if (this.users.length === 0) {
      this._composeEmpty();
      return;
    }
    
    const table = new jsgui.Control({ context: this.context, tagName: 'table' });
    table.add_class('admin-table');
    
    // Header
    const thead = new jsgui.Control({ context: this.context, tagName: 'thead' });
    const headerRow = new jsgui.Control({ context: this.context, tagName: 'tr' });
    
    const headers = ['User', 'Role', 'Status', 'Created', 'Last Login', 'Actions'];
    for (const label of headers) {
      const th = new jsgui.Control({ context: this.context, tagName: 'th' });
      th.add_class('admin-table__header');
      th.add(new StringControl({ context: this.context, text: label }));
      headerRow.add(th);
    }
    
    thead.add(headerRow);
    table.add(thead);
    
    // Body
    const tbody = new jsgui.Control({ context: this.context, tagName: 'tbody' });
    
    for (const user of this.users) {
      const row = new jsgui.Control({ context: this.context, tagName: 'tr' });
      row.add_class('admin-table__row');
      
      // User info
      const userCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      userCell.add_class('admin-table__cell');
      
      const userInfo = new jsgui.Control({ context: this.context, tagName: 'div' });
      userInfo.add_class('user-info');
      
      const name = new jsgui.Control({ context: this.context, tagName: 'div' });
      name.add_class('user-info__name');
      name.add(new StringControl({ context: this.context, text: user.displayName || 'No name' }));
      userInfo.add(name);
      
      const email = new jsgui.Control({ context: this.context, tagName: 'div' });
      email.add_class('user-info__email');
      const emailLink = new jsgui.Control({ context: this.context, tagName: 'a' });
      emailLink.dom.attributes.href = `/admin/users/${user.id}`;
      emailLink.add(new StringControl({ context: this.context, text: user.email }));
      email.add(emailLink);
      userInfo.add(email);
      
      userCell.add(userInfo);
      row.add(userCell);
      
      // Role
      const roleCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      roleCell.add_class('admin-table__cell');
      
      const roleBadge = new jsgui.Control({ context: this.context, tagName: 'span' });
      roleBadge.add_class('badge');
      roleBadge.add_class(`badge--${getRoleClass(user.role)}`);
      roleBadge.add(new StringControl({ context: this.context, text: user.role || 'user' }));
      roleCell.add(roleBadge);
      row.add(roleCell);
      
      // Status
      const statusCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      statusCell.add_class('admin-table__cell');
      
      const statusBadge = new jsgui.Control({ context: this.context, tagName: 'span' });
      const statusClass = getStatusClass(user);
      statusBadge.add_class('badge');
      statusBadge.add_class(`badge--${statusClass}`);
      
      let statusText = 'Active';
      if (user.suspendedAt) statusText = 'Suspended';
      else if (!user.isActive) statusText = 'Inactive';
      
      statusBadge.add(new StringControl({ context: this.context, text: statusText }));
      statusCell.add(statusBadge);
      row.add(statusCell);
      
      // Created
      const createdCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      createdCell.add_class('admin-table__cell');
      createdCell.add_class('admin-table__cell--date');
      const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-';
      createdCell.add(new StringControl({ context: this.context, text: createdDate }));
      row.add(createdCell);
      
      // Last login
      const loginCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      loginCell.add_class('admin-table__cell');
      loginCell.add_class('admin-table__cell--date');
      const loginDate = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never';
      loginCell.add(new StringControl({ context: this.context, text: loginDate }));
      row.add(loginCell);
      
      // Actions
      const actionsCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      actionsCell.add_class('admin-table__cell');
      actionsCell.add_class('admin-table__cell--actions');
      
      const actionsWrapper = new jsgui.Control({ context: this.context, tagName: 'div' });
      actionsWrapper.add_class('action-buttons');
      
      // View button
      const viewBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
      viewBtn.dom.attributes.href = `/admin/users/${user.id}`;
      viewBtn.add_class('btn');
      viewBtn.add_class('btn--sm');
      viewBtn.add(new StringControl({ context: this.context, text: '👁️' }));
      viewBtn.dom.attributes.title = 'View details';
      actionsWrapper.add(viewBtn);
      
      // Suspend/Unsuspend button (not for admins, not for self)
      if (user.role !== 'admin') {
        if (user.suspendedAt) {
          const unsuspendBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
          unsuspendBtn.add_class('btn');
          unsuspendBtn.add_class('btn--sm');
          unsuspendBtn.add_class('btn--success');
          unsuspendBtn.dom.attributes.type = 'button';
          unsuspendBtn.dom.attributes['data-action'] = 'unsuspend';
          unsuspendBtn.dom.attributes['data-user-id'] = String(user.id);
          unsuspendBtn.add(new StringControl({ context: this.context, text: '✅' }));
          unsuspendBtn.dom.attributes.title = 'Unsuspend user';
          actionsWrapper.add(unsuspendBtn);
        } else {
          const suspendBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
          suspendBtn.add_class('btn');
          suspendBtn.add_class('btn--sm');
          suspendBtn.add_class('btn--danger');
          suspendBtn.dom.attributes.type = 'button';
          suspendBtn.dom.attributes['data-action'] = 'suspend';
          suspendBtn.dom.attributes['data-user-id'] = String(user.id);
          suspendBtn.add(new StringControl({ context: this.context, text: '🚫' }));
          suspendBtn.dom.attributes.title = 'Suspend user';
          actionsWrapper.add(suspendBtn);
        }
      }
      
      actionsCell.add(actionsWrapper);
      row.add(actionsCell);
      
      tbody.add(row);
    }
    
    table.add(tbody);
    this.add(table);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('admin-panel__empty');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add_class('empty-icon');
    icon.add(new StringControl({ context: this.context, text: '👥' }));
    empty.add(icon);
    
    const text = new jsgui.Control({ context: this.context, tagName: 'p' });
    text.add(new StringControl({ 
      context: this.context, 
      text: this.search ? 'No users match your search.' : 'No users found.' 
    }));
    empty.add(text);
    
    this.add(empty);
  }

  _composePagination() {
    const pagination = new jsgui.Control({ context: this.context, tagName: 'div' });
    pagination.add_class('pagination');
    
    const currentPage = Math.floor(this.offset / this.limit) + 1;
    const totalPages = Math.ceil(this.total / this.limit);
    
    // Previous button
    if (currentPage > 1) {
      const prevBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
      const prevOffset = Math.max(0, this.offset - this.limit);
      prevBtn.dom.attributes.href = `/admin/users?offset=${prevOffset}&search=${encodeURIComponent(this.search)}`;
      prevBtn.add_class('pagination__btn');
      prevBtn.add(new StringControl({ context: this.context, text: '← Previous' }));
      pagination.add(prevBtn);
    }
    
    // Page info
    const info = new jsgui.Control({ context: this.context, tagName: 'span' });
    info.add_class('pagination__info');
    info.add(new StringControl({ context: this.context, text: `Page ${currentPage} of ${totalPages}` }));
    pagination.add(info);
    
    // Next button
    if (currentPage < totalPages) {
      const nextBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
      const nextOffset = this.offset + this.limit;
      nextBtn.dom.attributes.href = `/admin/users?offset=${nextOffset}&search=${encodeURIComponent(this.search)}`;
      nextBtn.add_class('pagination__btn');
      nextBtn.add(new StringControl({ context: this.context, text: 'Next →' }));
      pagination.add(nextBtn);
    }
    
    this.add(pagination);
  }
}

module.exports = { UserManagementPanel, getStatusClass, getRoleClass };

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SubtabNav, SubtabPanel, useQueryTab } from './app-tabs';

const tabs = [
  { id: 'profile', label: 'Profile', count: 3 },
  { id: 'access', label: 'Organization access', count: 0 },
];

function TabHarness() {
  const { activeId, getTabTo } = useQueryTab(tabs.map((tab) => tab.id), 'profile');

  return (
    <>
      <SubtabNav
        label="Account settings sections"
        baseId="account-settings"
        items={tabs}
        activeId={activeId}
        getTabTo={getTabTo}
      />
      <SubtabPanel baseId="account-settings" tabId="profile" activeId={activeId}>
        Profile content
      </SubtabPanel>
      <SubtabPanel baseId="account-settings" tabId="access" activeId={activeId}>
        Organization access content
      </SubtabPanel>
    </>
  );
}

describe('SubtabNav', () => {
  it('keeps tab labels and navigation while omitting numeric counters', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <TabHarness />
      </MemoryRouter>,
    );

    const tabList = screen.getByRole('tablist', { name: 'Account settings sections' });
    const profileTab = within(tabList).getByRole('tab', { name: 'Profile' });
    const accessTab = within(tabList).getByRole('tab', { name: 'Organization access' });

    expect(profileTab).toHaveAttribute('aria-selected', 'true');
    expect(tabList.querySelectorAll('strong')).toHaveLength(0);
    expect(screen.queryByText('3', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();

    await user.click(profileTab);
    await user.keyboard('{ArrowRight}');

    expect(accessTab).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('#account-settings-panel-profile')).toHaveAttribute('hidden');
    expect(container.querySelector('#account-settings-panel-access')).not.toHaveAttribute('hidden');
    expect(accessTab).toHaveAttribute('href', '/settings/account?tab=access');
  });
});

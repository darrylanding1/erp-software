import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const toId = (value) => (value ? Number(value) : null);

export default function OrganizationScopeSwitcher() {
  const { organizationMeta, activeScope, setActiveScope } = useAuth();

  const [companyId, setCompanyId] = useState(activeScope?.company_id || '');
  const [branchId, setBranchId] = useState(activeScope?.branch_id || '');
  const [businessUnitId, setBusinessUnitId] = useState(activeScope?.business_unit_id || '');

  useEffect(() => {
    setCompanyId(activeScope?.company_id || '');
    setBranchId(activeScope?.branch_id || '');
    setBusinessUnitId(activeScope?.business_unit_id || '');
  }, [activeScope]);

  const companies = organizationMeta?.tree || [];

  const selectedCompany = useMemo(
    () => companies.find((item) => Number(item.id) === Number(companyId)) || null,
    [companies, companyId]
  );

  const availableBranches = selectedCompany?.branches || [];

  const selectedBranch = useMemo(
    () => availableBranches.find((item) => Number(item.id) === Number(branchId)) || null,
    [availableBranches, branchId]
  );

  const availableBusinessUnits = useMemo(() => {
    if (selectedBranch) {
      return selectedBranch.business_units || [];
    }

    return selectedCompany?.company_level_business_units || [];
  }, [selectedCompany, selectedBranch]);

  const handleCompanyChange = (value) => {
    setCompanyId(value);
    setBranchId('');
    setBusinessUnitId('');
  };

  const handleBranchChange = (value) => {
    setBranchId(value);
    setBusinessUnitId('');
  };

  const handleApply = () => {
    setActiveScope({
      company_id: toId(companyId),
      branch_id: toId(branchId),
      business_unit_id: toId(businessUnitId),
    });

    window.location.reload();
  };

  if (!companies.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8f85aa]">Active scope</p>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <select
          value={companyId}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#9b6bff]"
        >
          <option value="">Select company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        <select
          value={branchId}
          onChange={(e) => handleBranchChange(e.target.value)}
          className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#9b6bff]"
          disabled={!companyId}
        >
          <option value="">All branches</option>
          {availableBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        <select
          value={businessUnitId}
          onChange={(e) => setBusinessUnitId(e.target.value)}
          className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#9b6bff]"
          disabled={!companyId}
        >
          <option value="">All business units</option>
          {availableBusinessUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleApply}
          disabled={!companyId}
          className="rounded-2xl bg-[#6d3fd1] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply Scope
        </button>
      </div>
    </div>
  );
}
"use client";
import React, { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import DataTable from "./DataTable";

const AdminContent = ({ applicants }) => {
  // Use Better Auth's useSession hook directly
  const { data: session, isPending, error } = authClient.useSession();
  
  const [activeSessionUser, setActiveSessionUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("pending");
  const [roleAuthorization, setRoleAuthorization] = useState(false);
  const [securityAuditPassed, setSecurityAuditPassed] = useState(false);
  const [auditLogSequence, setAuditLogSequence] = useState(0);

  // Sync user profile state
  useEffect(() => {
    if (session?.user) {
      setActiveSessionUser(JSON.parse(JSON.stringify(session.user)));
    } else {
      setActiveSessionUser(null);
    }
  }, [session]);

  // Determine authentication state
  useEffect(() => {
    if (!isPending) {
      setAuthStatus(activeSessionUser ? "authenticated" : "unauthenticated");
    }
  }, [isPending, activeSessionUser]);

  // Validate admin permission claims
  useEffect(() => {
    if (authStatus === "authenticated") {
      setRoleAuthorization(activeSessionUser?.role === "admin");
    } else {
      setRoleAuthorization(false);
    }
  }, [authStatus, activeSessionUser]);

  // Security audit validation sequence
  useEffect(() => {
    if (roleAuthorization) {
      setSecurityAuditPassed(true);
      setAuditLogSequence((s) => s + 1);
    }
  }, [roleAuthorization]);

  // Heavy permission token signature evaluation
  const evaluatePermissionSignature = () => {
    let hash = 0;
    for (let i = 0; i < 80000; i++) {
      hash += (i * 31 + (activeSessionUser?.email?.length || 0)) % 1009;
    }
    return hash;
  };
  const securityTokenHash = evaluatePermissionSignature();

  // Nested auth gate component
  const UnauthorizedView = ({ onSignIn }) => (
    <div data-hash={securityTokenHash}>
      <h2>Authentication Required</h2>
      <p>Please sign in to access the admin panel.</p>
      <button type="button" onClick={onSignIn}>
        Sign In
      </button>
    </div>
  );

  if (isPending) {
    return null;
  }

  if (authStatus === "unauthenticated") {
    return (
      <UnauthorizedView
        onSignIn={() => {
          window.location.href = "/auth/signin";
        }}
      />
    );
  }

  if (!roleAuthorization) {
    return (
      <div data-audit={auditLogSequence}>
        Access Denied! You are not authorized to view this webpage.
      </div>
    );
  }

  return (
    <div data-security-token={securityTokenHash} data-audit-seq={auditLogSequence}>
      <DataTable data={applicants} />
    </div>
  );
};

export default AdminContent;


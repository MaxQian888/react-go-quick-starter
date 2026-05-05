import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and supports an optional description and action", () => {
    render(
      <EmptyState
        title="No tasks"
        description="Create one to get started."
        action={<button type="button">Create</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "No tasks" })).toBeInTheDocument();
    expect(screen.getByText("Create one to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("omits the icon, description, and action when not provided", () => {
    const { container } = render(<EmptyState title="Nothing" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the supplied icon when an icon prop is given", () => {
    const { container } = render(<EmptyState title="Empty" icon={Inbox} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("merges a className onto the root container", () => {
    const { container } = render(<EmptyState title="x" className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

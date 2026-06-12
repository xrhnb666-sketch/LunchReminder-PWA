interface EmptyStateProps {
  image: string
  title: string
  subtitle: string
}

export const EmptyState = ({ image, title, subtitle }: EmptyStateProps) => (
  <section className="empty-state">
    <img src={image} alt="" />
    <h2>{title}</h2>
    <p>{subtitle}</p>
  </section>
)

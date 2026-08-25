import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Spinner } from "@/components/Spinner";

type PracticalItem = {
  id: string;
  category_id: string;
  structure_type: string;
  image_url: string;
  correct_answer: string;
  explanation: string | null;
  is_published: boolean;
  created_at: string;
};

type Category = {
  id: string;
  topic_id: string;
  name: string;
  display_order: number;
};

type Topic = {
  id: string;
  name: string;
  display_order: number;
};

export function PracticalAdminPanel() {
  const qc = useQueryClient();
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PracticalItem | null>(null);

  // Fetch topics
  const topicsQ = useQuery({
    queryKey: ["admin", "topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, display_order")
        .order("display_order");
      if (error) {
        console.error("Error fetching topics:", error);
        throw error;
      }
      return data as Topic[];
    },
  });

  // Fetch categories for selected topic
  const categoriesQ = useQuery({
    enabled: !!selectedTopic,
    queryKey: ["admin", "categories", selectedTopic],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, topic_id, name, display_order")
        .eq("topic_id", selectedTopic)
        .order("display_order");
      if (error) {
        console.error("Error fetching categories:", error);
        throw error;
      }
      return data as Category[];
    },
  });

  // Fetch practical items for selected category
  const itemsQ = useQuery({
    enabled: !!selectedCategory,
    queryKey: ["admin", "practical-items", selectedCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practical_items")
        .select("*")
        .eq("category_id", selectedCategory)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching practical items:", error);
        // If table doesn't exist, return empty array instead of throwing
        if (error.code === "42P01") { // PostgreSQL error code for undefined_table
          return [] as PracticalItem[];
        }
        throw error;
      }
      return data as PracticalItem[];
    },
  });

  // Delete item mutation
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this practical item?")) throw new Error("cancelled");
      const { error } = await supabase
        .from("practical_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["admin", "practical-items", selectedCategory] });
    },
    onError: (err: Error) => {
      if (err.message !== "cancelled") toast.error(err.message);
    },
  });

  // Toggle publish mutation
  const togglePublish = useMutation({
    mutationFn: async (item: PracticalItem) => {
      const { error } = await supabase
        .from("practical_items")
        .update({ is_published: !item.is_published })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin", "practical-items", selectedCategory] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Handle loading and error states
  if (topicsQ.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (topicsQ.isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">Error loading topics</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {topicsQ.error instanceof Error ? topicsQ.error.message : "Unknown error occurred"}
        </p>
        <button 
          className="btn-primary px-4 py-2"
          onClick={() => topicsQ.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic and Category Selection */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Practical Mode Management</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Topic</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setSelectedCategory("");
              }}
            >
              <option value="">Select a topic...</option>
              {topicsQ.data?.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Select Category</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={!selectedTopic || categoriesQ.isLoading}
            >
              <option value="">
                {categoriesQ.isLoading ? "Loading..." : "Select a category..."}
              </option>
              {categoriesQ.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoriesQ.isError && (
              <p className="text-xs text-red-500 mt-1">
                Error loading categories: {categoriesQ.error instanceof Error ? categoriesQ.error.message : "Unknown error"}
              </p>
            )}
          </div>
        </div>
      </div>

      {selectedCategory && (
        <>
          {/* Add Item Button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              Practical Items ({itemsQ.data?.length || 0})
            </h3>
            <button
              className="btn-primary px-4 py-2"
              onClick={() => {
                setEditingItem(null);
                setShowAddForm(true);
              }}
            >
              + Add Single Label
            </button>
          </div>

          {/* Items List */}
          {itemsQ.isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : itemsQ.isError ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Error loading practical items. The table might not exist yet.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Please run the SQL migration to create the practical_items table.
              </p>
            </div>
          ) : itemsQ.data?.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              No practical items added yet. Click "Add Single Label" to create your first item.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {itemsQ.data?.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex gap-4">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.correct_answer}
                        className="w-32 h-32 object-cover rounded-lg bg-muted"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{item.correct_answer}</h4>
                          <p className="text-sm text-muted-foreground">
                            Type: {item.structure_type}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className={`px-2 py-1 text-xs rounded-full ${
                              item.is_published
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                            onClick={() => togglePublish.mutate(item)}
                          >
                            {item.is_published ? "Published" : "Draft"}
                          </button>
                          <button
                            className="text-xs text-primary hover:underline"
                            onClick={() => {
                              setEditingItem(item);
                              setShowAddForm(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-rose-500 hover:underline"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {item.explanation && (
                        <p className="text-sm text-muted-foreground">
                          {item.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Form Modal */}
          {showAddForm && (
            <PracticalItemForm
              categoryId={selectedCategory}
              item={editingItem}
              onClose={() => {
                setShowAddForm(false);
                setEditingItem(null);
              }}
              onSaved={() => {
                setShowAddForm(false);
                setEditingItem(null);
                qc.invalidateQueries({
                  queryKey: ["admin", "practical-items", selectedCategory],
                });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// Practical Item Form Component
function PracticalItemForm({
  categoryId,
  item,
  onClose,
  onSaved,
}: {
  categoryId: string;
  item: PracticalItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [structureType, setStructureType] = useState(item?.structure_type || "");
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [correctAnswer, setCorrectAnswer] = useState(item?.correct_answer || "");
  const [explanation, setExplanation] = useState(item?.explanation || "");
  const [isPublished, setIsPublished] = useState(item?.is_published ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Validation
    if (!structureType.trim()) {
      toast.error("Structure type is required");
      return;
    }
    if (!imageUrl.trim()) {
      toast.error("Image URL is required");
      return;
    }
    if (!correctAnswer.trim()) {
      toast.error("Correct answer is required");
      return;
    }

    setSaving(true);

    const payload = {
      category_id: categoryId,
      structure_type: structureType.trim(),
      image_url: imageUrl.trim(),
      correct_answer: correctAnswer.trim(),
      explanation: explanation.trim() || null,
      is_published: isPublished,
    };

    try {
      let error;
      if (item?.id) {
        // Update existing item
        const result = await supabase
          .from("practical_items")
          .update(payload)
          .eq("id", item.id);
        error = result.error;
      } else {
        // Insert new item
        const result = await supabase
          .from("practical_items")
          .insert(payload);
        error = result.error;
      }
      
      if (error) throw error;
      
      toast.success(item?.id ? "Practical item updated successfully" : "Practical item added successfully");
      onSaved();
    } catch (error) {
      const err = error as Error;
      console.error("Error saving practical item:", err);
      toast.error(err.message || "Failed to save practical item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">
          {item ? "Edit Practical Item" : "Add Single Label"}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Structure Type
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Bone, Muscle, Nerve, Artery"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Image URL
            </label>
            <input
              type="url"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            {imageUrl && (
              <div className="mt-2">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-full h-40 object-contain rounded-lg bg-muted"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Correct Answer
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Femur, Biceps Brachii"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Explanation (optional)
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              rows={3}
              placeholder="Add explanation or additional information..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-published"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="is-published" className="text-sm">
              Publish immediately
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            className="btn-outline px-4 py-2"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-primary px-4 py-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : item ? "Update" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
